'use client';
import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ACTIVITY_KIND, decodeBytes, encodeBytes, reduceMotion, type DotActivity } from '../lib/dot-motion';

export type CharacterOption = { id: string; title: string; selected: boolean; available: boolean; thumbnail?: string; color?: string };
export type CharacterPreview = { state: Uint8Array; catalog: CharacterOption[][]; presets: { id: string; title: string; thumbnail?: string }[]; preparation?: { pending: boolean; background: boolean; failed: boolean } };
export type CharacterReply = { error?: boolean; rejected?: boolean; state?: Uint8Array; png?: Uint8Array; preview?: CharacterPreview };
export type CharacterHandle = { command: (action: string, fields?: Record<string, unknown>) => Promise<CharacterReply> };
export const portraits = new Map<string, string>();
export function portraitKey(state?: string, preset = 'alfred') { return state || preset; }

export default function DotCharacter({ state, preset = 'alfred', mode = 'avatar', activity = 'Ready', turnId, onPreview, onReady, ref }: { state?: string; preset?: string; mode?: 'avatar' | 'editor'; activity?: DotActivity; turnId?: string; onPreview?: (preview: CharacterPreview) => void; onReady?: () => void; ref?: Ref<CharacterHandle> }) {
  const ownerId = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const next = useRef(0);
  const drag = useRef<{ id: number; x: number; y: number; distance: number } | null>(null);
  const requests = useRef(new Map<number, { resolve: (reply: CharacterReply) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const current = useRef({ state, preset, mode, activity, turnId, onPreview, onReady });
  current.current = { state, preset, mode, activity, turnId, onPreview, onReady };
  const post = (data: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ ...data, ownerId }, location.origin);
  useImperativeHandle(ref, () => ({ command(action, fields = {}) {
    return new Promise((resolve, reject) => {
      const id = ++next.current;
      const timer = setTimeout(() => { requests.current.delete(id); reject(new Error('캐릭터 응답 시간이 초과되었습니다.')); }, 20000);
      requests.current.set(id, { resolve, reject, timer });
      post({ type: 'orbit-character-editor', id, action, ...fields });
    });
  } }));
  const sync = useRef<(ready?: boolean) => void>(() => {});
  useEffect(() => {
    let visible = true;
    let attention: ReturnType<typeof setTimeout> | undefined;
    let entered = false;
    const node = frame.current!;
    const send = (data: Record<string, unknown>) => node.contentWindow?.postMessage({ ...data, ownerId }, location.origin);
    const update = (requestReady = false) => {
      const props = current.current;
      send({ type: 'orbit-character', presentation: props.mode, state: decodeBytes(props.state), preset: props.preset, active: visible && !document.hidden, reducedMotion: reduceMotion(), requestReady, framing: 'content', activity: { kind: ACTIVITY_KIND[props.activity], turnId: props.turnId ?? null } });
    };
    sync.current = update;
    const receive = (event: MessageEvent) => {
      if (event.source !== node.contentWindow || event.origin !== location.origin) return;
      const data = event.data;
      if (!data || (data.ownerId !== undefined && data.ownerId !== ownerId)) return;
      if (data.type === 'orbit-character') {
        if (data.status === 'loaded') update(true);
        if (data.status === 'ready') { setStatus('ready'); current.current.onReady?.(); }
        if (data.status === 'failed') { setStatus('failed'); for (const r of requests.current.values()) { clearTimeout(r.timer); r.reject(new Error('캐릭터 렌더러를 시작하지 못했습니다.')); } requests.current.clear(); }
        if (data.status === 'snapshot' && data.png instanceof Uint8Array && data.png.length < 1024 * 1024) {
          const key = portraitKey(current.current.state, current.current.preset);
          portraits.set(key, 'data:image/png;base64,' + encodeBytes(data.png));
          window.dispatchEvent(new CustomEvent('dot-portrait', { detail: key }));
        }
      } else if (data.type === 'orbit-character-editor') {
        if (data.preview) current.current.onPreview?.(data.preview);
        const pending = requests.current.get(data.id);
        if (pending) { clearTimeout(pending.timer); requests.current.delete(data.id); pending.resolve(data); }
      }
    };
    const clearAttention = () => { clearTimeout(attention); attention = undefined; entered = false; send({ type: 'orbit-character-pointer-cancel' }); };
    const pointer = (event: PointerEvent) => {
      if (current.current.mode !== 'avatar' || event.pointerType === 'touch') return;
      const r = node.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (inside && !entered) { clearTimeout(attention); attention = setTimeout(clearAttention, 10000); }
      entered = inside;
      if (attention && r.width && r.height) send({ type: 'orbit-character-pointer', x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height });
    };
    const visibility = () => { if (document.hidden) clearAttention(); update(); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(node);
    const settings = new MutationObserver(() => update());
    settings.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduce-motion', 'data-theme'] });
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', visibility);
    window.addEventListener('message', receive);
    window.addEventListener('pointermove', pointer, true);
    window.addEventListener('blur', clearAttention);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearAttention(); observer.disconnect(); settings.disconnect(); media.removeEventListener('change', visibility);
      window.removeEventListener('message', receive); window.removeEventListener('pointermove', pointer, true); window.removeEventListener('blur', clearAttention); document.removeEventListener('visibilitychange', visibility);
      send({ type: 'orbit-character-dispose' });
      for (const p of requests.current.values()) { clearTimeout(p.timer); p.reject(new Error('캐릭터 화면이 닫혔습니다.')); }
      requests.current.clear();
    };
  }, [ownerId]);
  useEffect(() => { sync.current(); }, [state, preset, mode, activity, turnId]);
  return <span className="dot-character" data-status={status} data-mode={mode}>
    <iframe ref={frame} title={mode === 'editor' ? 'Dot 캐릭터 미리보기' : 'Dot 캐릭터'} tabIndex={-1} aria-hidden={mode === 'avatar'} onLoad={() => sync.current(true)} src="/dot-engine/fd5f2a1997e55d5f/frame.html" />
    {mode === 'editor' && status === 'ready' && <button type="button" className="character-interaction" aria-label="캐릭터를 드래그하거나 눌러 인사하기"
      onPointerDown={event => { if (!event.isPrimary || event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 }; const r = event.currentTarget.getBoundingClientRect(); post({ type: 'orbit-character-gesture', phase: 'down', id: event.pointerId, x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height }); }}
      onPointerMove={event => { const r = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - r.left) / r.width, y = (event.clientY - r.top) / r.height; if (!drag.current) { post({ type: 'orbit-character-pointer', x, y }); return; } if (drag.current.id !== event.pointerId) return; drag.current.distance = Math.max(drag.current.distance, Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y)); if (drag.current.distance > 6) post({ type: 'orbit-character-gesture', phase: 'move', id: event.pointerId, x, y }); }}
      onPointerUp={event => { const start = drag.current; if (!start || start.id !== event.pointerId) return; const r = event.currentTarget.getBoundingClientRect(); const distance = Math.max(start.distance, Math.hypot(event.clientX - start.x, event.clientY - start.y)); post({ type: 'orbit-character-gesture', phase: 'up', id: event.pointerId, x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height }); drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); if (distance <= 6) post({ type: 'orbit-character-editor', id: ++next.current, action: 'reaction' }); }}
      onPointerCancel={() => { if (drag.current) post({ type: 'orbit-character-gesture', phase: 'cancel', id: drag.current.id, x: 0, y: 0 }); drag.current = null; }}
      onLostPointerCapture={() => { if (drag.current) post({ type: 'orbit-character-gesture', phase: 'cancel', id: drag.current.id, x: 0, y: 0 }); drag.current = null; }}
      onPointerLeave={() => { if (!drag.current) post({ type: 'orbit-character-pointer-cancel' }); }}
      onClick={event => { if (event.detail === 0) post({ type: 'orbit-character-editor', id: ++next.current, action: 'reaction' }); }} />}
    {status === 'failed' && <span className="character-failed">캐릭터를 불러오지 못했어요.</span>}
  </span>;
}
