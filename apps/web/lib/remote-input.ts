import type { Computer } from './api';

type Body = Record<string, unknown>;
type Entry = { body: Body; epoch: number | null; release: boolean };

// Keep discrete actions in order, but only send the latest position of a drag.
export class RemoteInputQueue {
  private pending: Entry[] = [];
  private running = false;
  private controller: AbortController | null = null;

  private getState: () => Computer;
  private transmit: (entry: Entry, signal: AbortSignal) => Promise<unknown>;
  private onFailure: (error: unknown) => void;

  constructor(
    getState: () => Computer,
    transmit: (entry: Entry, signal: AbortSignal) => Promise<unknown>,
    onFailure: (error: unknown) => void,
  ) {
    this.getState = getState;
    this.transmit = transmit;
    this.onFailure = onFailure;
  }

  send(body: Body) {
    const state = this.getState();
    if (!state.connected || state.owner !== 'USER' || state.handoff) return;
    const last = this.pending.at(-1);
    if (last && last.epoch === state.epoch && !last.release && last.body.action === body.action) {
      if (body.action === 'move') { last.body = body; return; }
      if (body.action === 'scroll') {
        last.body = { ...body, delta: Math.max(-20, Math.min(20, Number(last.body.delta) + Number(body.delta))) };
        return;
      }
      if (body.action === 'type' && String(last.body.text).length + String(body.text).length <= 4000) {
        last.body = { ...body, text: String(last.body.text) + String(body.text) };
        return;
      }
    }
    if (this.pending.length >= 64) {
      this.reset();
      this.onFailure(new Error('원격 입력이 지연되어 대기 입력을 초기화했습니다. 다시 조작해 주세요.'));
      this.release();
      return;
    }
    this.pending.push({ body, epoch: state.epoch, release: false });
    void this.flush();
  }

  release() {
    const state = this.getState();
    if (!state.connected || state.owner !== 'USER' || this.pending.at(-1)?.release) return;
    this.pending.push({ body: {}, epoch: state.epoch, release: true });
    void this.flush();
  }

  reset() {
    this.pending = [];
    this.controller?.abort();
  }

  private async flush() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const entry = this.pending.shift()!;
        const state = this.getState();
        if (!state.connected || state.owner !== 'USER' || state.epoch !== entry.epoch || (state.handoff && !entry.release)) continue;
        const controller = new AbortController();
        this.controller = controller;
        try { await this.transmit(entry, controller.signal); }
        catch (error) {
          if (controller.signal.aborted) continue;
          if (entry.release) continue;
          this.pending = [];
          this.onFailure(error);
          // Never replay uncertain input. Release held keys/buttons before new input.
          this.release();
        }
      }
    } finally { this.controller = null; this.running = false; }
  }
}
