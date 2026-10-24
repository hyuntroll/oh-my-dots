'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, GripHorizontal, Loader2, Monitor, MoreHorizontal, PictureInPicture2, RotateCcw, X } from 'lucide-react';
import { api, post, type Computer } from '../lib/api';
import { RemoteInputQueue, KEY_NAMES, keyName } from '../lib/remote-input';
import { connectComputerStream } from '../lib/computer-stream';
import { clampPip, defaultPipRect, parsePipRect, PIP_CONTROLS, type PipRect } from '../lib/dot-lifecycle';

const PIP_KEY = 'ohmydots-pip-rect';

export default function FloatingComputer({ sessionId = 'computer-1', name, computer, onRefresh, onControlChanged, onError, onRestore, onSendToDot, onHideForChat, onHideForAll, onClose }: {
  sessionId?: string; name: string; computer: Computer;
  onRefresh: () => Promise<void>; onControlChanged: (state: Computer) => void; onError: (message: string) => void;
  onRestore: () => void; onSendToDot: () => void; onHideForChat: () => void; onHideForAll: () => void; onClose: () => void;
}) {
  const PREFIX = '/computer-sessions/' + sessionId;
  const frame = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stream = useRef<ReturnType<typeof connectComputerStream> | null>(null);
  const drag = useRef<{ x: number; y: number; rect: PipRect; kind: 'move' | 'resize' } | null>(null);
  const state = useRef(computer);
  state.current = computer;
  const keys = useRef(new Set<string>());
  const handoffActive = useRef(false);
  const composition = useRef(false);
  const [rect, setRect] = useState<PipRect>(() => defaultPipRect({ width: 1200, height: 800 }));
  const [controlsOpen, setControlsOpen] = useState(false);
  const [connection, setConnection] = useState('connecting');
  const [reconnect, setReconnect] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  useEffect(() => {
    const saved = typeof window === 'undefined' ? null : localStorage.getItem(PIP_KEY);
    setRect(parsePipRect(saved, { width: window.innerWidth, height: window.innerHeight }));
    const keepInside = () => setRect(current => clampPip(current, { width: window.innerWidth, height: window.innerHeight }));
    window.addEventListener('resize', keepInside);
    return () => window.removeEventListener('resize', keepInside);
  }, []);
  const persist = useCallback((next: PipRect) => {
    try { localStorage.setItem(PIP_KEY, JSON.stringify(next)); } catch { /* Storage is optional for the floating window. */ }
  }, []);
  const move = (event: React.PointerEvent) => {
    const active = drag.current;
    if (!active) return;
    const bounds = { width: window.innerWidth, height: window.innerHeight };
    const next = active.kind === 'move'
      ? clampPip({ ...active.rect, x: active.rect.x + event.clientX - active.x, y: active.rect.y + event.clientY - active.y }, bounds)
      : clampPip({ ...active.rect, width: active.rect.width + event.clientX - active.x, height: active.rect.height + event.clientY - active.y }, bounds);
    setRect(next);
  };
  const finishMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setRect(current => { persist(current); return current; });
  };
  const start = (kind: 'move' | 'resize') => (event: React.PointerEvent) => {
    if (kind === 'move' && (event.target as HTMLElement).closest('button,input,textarea')) return;
    drag.current = { x: event.clientX, y: event.clientY, rect, kind };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const refresh = useCallback(() => { void onRefresh().catch(() => {}); }, [onRefresh]);
  const queue = useMemo(() => new RemoteInputQueue(
    () => state.current,
    (entry, signal) => api(PREFIX + (entry.release ? '/release' : '/input'), { ...post({ ...entry.body, epoch: entry.epoch }), signal }),
    error => { keys.current.clear(); onError((error as Error).message); refresh(); },
  ), [PREFIX, onError, refresh]);
  useEffect(() => { queue.reset(); keys.current.clear(); }, [queue, computer.epoch, computer.owner, computer.handoff]);
  useEffect(() => () => queue.reset(), [queue]);
  const send = useCallback((body: Record<string, unknown>) => { if (!handoffActive.current) queue.send(body); }, [queue]);
  const release = useCallback(() => { keys.current.clear(); queue.release(); }, [queue]);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const link = connectComputerStream(node,
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api${PREFIX}/stream`,
      () => import('@novnc/novnc').then(module => module.default), setConnection,
      () => { queue.reset(); release(); refresh(); }, () => setReconnect(n => n + 1));
    stream.current = link;
    return () => { stream.current = null; link.close(); };
  }, [PREFIX, reconnect, queue, release, refresh]);
  useEffect(() => {
    const resync = () => { refresh(); stream.current?.resume(); };
    const visible = () => { if (!document.hidden) resync(); };
    window.addEventListener('online', resync);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('online', resync); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  useEffect(() => {
    if (!computer.connected) return;
    const controller = new AbortController();
    void api(PREFIX + '/appearance', { ...post({ accent: undefined, name }), signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [PREFIX, name, computer.connected]);

  const userControls = computer.owner === 'USER' && !computer.handoff && !busy && connection === 'connected';
  const point = (event: React.PointerEvent<HTMLTextAreaElement> | React.WheelEvent<HTMLTextAreaElement>) => {
    const box = host.current?.querySelector('canvas')?.getBoundingClientRect();
    if (!box || !box.width || !box.height || event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) return null;
    const width = computer.width || 1280, height = computer.height || 960;
    return { x: Math.min(width - 1, Math.max(0, Math.floor((event.clientX - box.left) / box.width * width))), y: Math.min(height - 1, Math.max(0, Math.floor((event.clientY - box.top) / box.height * height))) };
  };
  const handoff = async () => {
    if (handoffActive.current) return;
    handoffActive.current = true;
    setBusy(true);
    const returning = computer.owner === 'USER';
    queue.reset();
    release();
    try {
      const control = await api<Computer>(PREFIX + (returning ? '/return' : '/takeover'), post(), returning ? 115_000 : 10_000);
      onControlChanged({ ...computer, ...control, connected: true });
    } catch (error) { onError((error as Error).message); }
    finally { handoffActive.current = false; setBusy(false); refresh(); }
  };
  const choose = (action: 'restore' | 'hide' | 'chat' | 'all' | 'dot') => {
    setControlsOpen(false);
    if (action === 'restore') onRestore();
    else if (action === 'hide') onClose();
    else if (action === 'chat') onHideForChat();
    else if (action === 'all') onHideForAll();
    else onSendToDot();
  };
  return <section ref={frame} className="pip-window" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} aria-label={name + '의 컴퓨터 떠 있는 창'}>
    <header className="pip-heading" onPointerDown={start('move')} onPointerMove={move} onPointerUp={finishMove} data-dragging={!!drag.current}>
      <GripHorizontal size={14} aria-hidden />
      <Monitor size={13} />
      <strong>{name}의 컴퓨터</strong>
      <span className={'connection ' + (connection === 'connected' ? 'online' : '')} title={connection === 'connected' ? '실시간 연결' : '연결 중'}><i /></span>
      <button className="icon-button" aria-label="떠 있는 창 설정" aria-expanded={controlsOpen} aria-haspopup="menu" onClick={() => setControlsOpen(!controlsOpen)}><MoreHorizontal size={16} /></button>
      <button className="icon-button" aria-label="떠 있는 창 닫기" onClick={onClose}><X size={15} /></button>
    </header>
    {controlsOpen && <div className="pip-controls" role="menu" aria-label="떠 있는 창 제어">
      <button role="menuitem" onClick={() => choose('restore')}><PictureInPicture2 size={15} />{PIP_CONTROLS.restore}</button>
      <button role="menuitem" onClick={() => choose('hide')}>{PIP_CONTROLS.hide}</button>
      <button role="menuitem" onClick={() => choose('chat')}>{PIP_CONTROLS.hideForChat}</button>
      <button role="menuitem" onClick={() => choose('all')}>{PIP_CONTROLS.hideForAll}</button>
      <button role="menuitem" onClick={() => choose('dot')}>{PIP_CONTROLS.sendToDot}</button>
    </div>}
    <div className="pip-stage" style={{ aspectRatio: `${computer.width || 1280} / ${computer.height || 960}` }}>
      <div className="pip-surface" ref={host} />
      {userControls && <textarea ref={input} aria-label="떠 있는 창 원격 입력" className="desktop-input" autoCapitalize="off" autoComplete="off" spellCheck={false}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => { const p = point(event); if (p) { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); send({ action: 'down', button: event.button === 2 ? 3 : event.button === 1 ? 2 : 1, ...p }); } }}
        onPointerMove={event => { if (event.buttons) { const p = point(event); if (p) send({ action: 'move', ...p }); } }}
        onPointerUp={event => { const p = point(event); if (p) send({ action: 'up', button: event.button === 2 ? 3 : event.button === 1 ? 2 : 1, ...p }); }}
        onLostPointerCapture={release} onBlur={release}
        onWheel={event => { const p = point(event); if (p) send({ action: 'scroll', delta: event.deltaY > 0 ? 2 : -2, ...p }); }}
        onKeyDown={event => {
          if (!KEY_NAMES[event.key] && !event.ctrlKey && !event.metaKey && !event.altKey) return;
          if (event.key === ' ' && !event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          const key = keyName(event.key, event.code);
          keys.current.add(key);
          send({ action: 'keydown', key });
        }}
        onKeyUp={event => { const key = keyName(event.key, event.code); if (keys.current.delete(key)) { event.preventDefault(); send({ action: 'keyup', key }); } }}
        onCompositionStart={() => { composition.current = true; }}
        onCompositionEnd={event => { composition.current = false; if (event.data) send({ action: 'type', text: event.data }); event.currentTarget.value = ''; }}
        onChange={event => { if (!composition.current && event.currentTarget.value) { send({ action: 'type', text: event.currentTarget.value }); event.currentTarget.value = ''; } }}
        onPaste={event => { event.preventDefault(); send({ action: 'type', text: event.clipboardData.getData('text') }); }} />}
      {connection !== 'connected' && <div className="desktop-placeholder"><Monitor size={26} /><strong>{computer.connected ? '화면을 불러오는 중' : '컴퓨터 연결을 기다리는 중'}</strong></div>}
      {(busy || computer.handoff) && <div className="handoff-overlay"><Loader2 size={18} className="spin" />제어권을 전환하고 있어요</div>}
    </div>
    <footer className="pip-bar">
      <button className="button" disabled={!computer.connected || busy || computer.handoff} onClick={handoff}>{busy ? '전환 중…' : computer.owner === 'USER' ? 'Return control' : 'Take over'}</button>
      <button className="icon-button" aria-label="화면 다시 연결" title="다시 연결" onClick={() => { queue.reset(); release(); refresh(); setReconnect(n => n + 1); }}><RotateCcw size={14} /></button>
      <button className="icon-button" aria-label="떠 있는 창에 텍스트 입력" title="텍스트 입력" disabled={!userControls} onClick={() => setPasteOpen(!pasteOpen)}><Clipboard size={14} /></button>
    </footer>
    {pasteOpen && userControls && <form className="pip-paste" onSubmit={event => { event.preventDefault(); if (pasteText.trim()) { send({ action: 'type', text: pasteText }); setPasteText(''); setPasteOpen(false); } }}>
      <input aria-label="컴퓨터에 보낼 텍스트" value={pasteText} onChange={event => setPasteText(event.target.value)} maxLength={4000} autoFocus placeholder="보낼 텍스트" />
      <button className="button" disabled={!pasteText.trim()}>입력</button>
    </form>}
    <span className="pip-resize" aria-hidden onPointerDown={start('resize')} onPointerMove={move} onPointerUp={finishMove} />
  </section>;
}
