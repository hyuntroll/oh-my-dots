import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { cachedNativePortrait, decodeAppearance, nativePortrait, pngDataUrl, reducedMotion, type CharacterActivity, type CharacterHandle, type CharacterPreview, type CharacterReply } from '../lib/character';
import '../character.css';

export type CharacterProps = { preset?: string; state?: string; activity?: CharacterActivity; size?: number; className?: string; onSnapshot?: (png: string) => void };
type SurfaceProps = CharacterProps & { mode?: 'avatar' | 'editor'; onReady?: () => void; onPreview?: (preview: CharacterPreview) => void };

/** Original same-origin iframe protocol. The frame retains the native renderer. */
export const CharacterSurface = forwardRef<CharacterHandle, SurfaceProps>(function CharacterSurface(props, ref) {
  const { size, className = '', mode = 'avatar' } = props;
  const ownerId = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const current = useRef(props); current.current = props;
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [failure, setFailure] = useState('');
  const counter = useRef(0);
  const disposal = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drag = useRef<{ id: number; x: number; y: number; distance: number } | null>(null);
  const pending = useRef(new Map<number, { resolve: (reply: CharacterReply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const send = (data: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ ...data, ownerId }, location.origin);
  const sync = useRef<(requestReady?: boolean) => void>(() => {});
  const command = (action: string, fields: Record<string, unknown> = {}): Promise<CharacterReply> => new Promise((resolve, reject) => {
    const id = ++counter.current;
    const timer = setTimeout(() => { pending.current.delete(id); reject(new Error('Character renderer timed out.')); }, 30000);
    pending.current.set(id, { resolve, reject, timer });
    send({ type: 'orbit-character-editor', id, action, ...fields });
  });
  useImperativeHandle(ref, () => ({ command }));
  useEffect(() => {
    clearTimeout(disposal.current);
    const node = frame.current!;
    let visible = true;
    let attention: ReturnType<typeof setTimeout> | undefined;
    let entered = false;
    const post = (data: Record<string, unknown>) => node.contentWindow?.postMessage({ ...data, ownerId }, location.origin);
    const fail = (message: string) => {
      setStatus('failed'); setFailure(message);
      for (const request of pending.current.values()) { clearTimeout(request.timer); request.reject(new Error(message)); }
      pending.current.clear();
    };
    const update = (requestReady = false) => {
      const p = current.current;
      try {
        post({ type: 'orbit-character', presentation: p.mode ?? 'avatar', state: decodeAppearance(p.state), preset: p.preset ?? 'alfred', active: visible && !document.hidden, reducedMotion: reducedMotion(), requestReady, framing: p.mode === 'editor' ? 'content' : 'activity', activity: p.activity ?? { kind: 7, turnId: null } });
      } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
    };
    sync.current = update;
    const receive = (event: MessageEvent) => {
      if (event.source !== node.contentWindow || event.origin !== location.origin) return;
      const data = event.data;
      if (!data || (data.ownerId !== undefined && data.ownerId !== ownerId)) return;
      if (data.type === 'orbit-character') {
        if (data.status === 'loaded') update(true);
        if (data.status === 'ready') { setStatus('ready'); current.current.onReady?.(); }
        if (data.status === 'failed') fail(`Character renderer failed (${data.reason ?? 'runtime'}).`);
        if (data.status === 'snapshot' && data.png instanceof Uint8Array) current.current.onSnapshot?.(pngDataUrl(data.png));
      }
      if (data.type === 'orbit-character-editor' && data.ownerId === ownerId) {
        if (data.preview) current.current.onPreview?.(data.preview);
        if (data.png instanceof Uint8Array) current.current.onSnapshot?.(pngDataUrl(data.png));
        const request = pending.current.get(data.id);
        if (request) { clearTimeout(request.timer); pending.current.delete(data.id); request.resolve(data); }
      }
    };
    const cancel = () => {
      clearTimeout(attention); attention = undefined; entered = false;
      if (drag.current) { post({ type: 'orbit-character-gesture', phase: 'cancel', id: drag.current.id, x: 0, y: 0 }); drag.current = null; }
      post({ type: 'orbit-character-pointer-cancel' });
    };
    const pointer = (event: PointerEvent) => {
      if ((current.current.mode ?? 'avatar') !== 'avatar' || event.pointerType === 'touch') return;
      const bounds = node.getBoundingClientRect();
      const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      if (inside && !entered) { clearTimeout(attention); attention = setTimeout(cancel, 10000); }
      entered = inside;
      if (attention && bounds.width && bounds.height) post({ type: 'orbit-character-pointer', x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height });
    };
    const visibility = () => { if (document.hidden) cancel(); update(); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }); observer.observe(node);
    const media = matchMedia('(prefers-reduced-motion: reduce)'); media.addEventListener('change', visibility);
    window.addEventListener('message', receive); window.addEventListener('pointermove', pointer, true); window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancel(); observer.disconnect(); media.removeEventListener('change', visibility);
      window.removeEventListener('message', receive); window.removeEventListener('pointermove', pointer, true); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', visibility);
      // React development mode replays effects on the same iframe. A real
      // removal also triggers the original frame's pagehide cleanup.
      disposal.current = setTimeout(() => post({ type: 'orbit-character-dispose' }), 0);
      for (const request of pending.current.values()) { clearTimeout(request.timer); request.reject(new Error('Character closed.')); }
      pending.current.clear();
    };
  }, [ownerId]);
  useEffect(() => { sync.current(); }, [props.state, props.preset, props.activity?.kind, props.activity?.turnId, mode]);
  const gesture = (phase: string, event: React.PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    send({ type: 'orbit-character-gesture', phase, id: event.pointerId, x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height });
  };
  return <span className={`dot-native-character ${className}`} data-status={status} data-mode={mode} style={size ? { width: size, height: size } : undefined}>
    <iframe ref={frame} title={mode === 'editor' ? 'Dot appearance preview' : 'Dot character'} tabIndex={-1} aria-hidden={mode !== 'editor'} onLoad={() => sync.current(true)} src="/dot-engine/fd5f2a1997e55d5f/frame.html" />
    {mode === 'editor' && <button className="dot-character-interaction" type="button" aria-label="Drag the character, or press to play its signature reaction" disabled={status !== 'ready'}
      onPointerDown={event => { if (!event.isPrimary || event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 }; gesture('down', event); }}
      onPointerMove={event => { const start = drag.current; if (!start) { const b = event.currentTarget.getBoundingClientRect(); send({ type: 'orbit-character-pointer', x: (event.clientX - b.left) / b.width, y: (event.clientY - b.top) / b.height }); return; } if (start.id !== event.pointerId) return; start.distance = Math.max(start.distance, Math.hypot(event.clientX - start.x, event.clientY - start.y)); if (start.distance > 6) gesture('move', event); }}
      onPointerUp={event => { const start = drag.current; if (!start || start.id !== event.pointerId) return; gesture('up', event); drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); if (Math.max(start.distance, Math.hypot(event.clientX - start.x, event.clientY - start.y)) <= 6) void command('reaction').catch(() => {}); }}
      onPointerCancel={event => { if (drag.current) gesture('cancel', event); drag.current = null; }}
      onLostPointerCapture={event => { if (drag.current) gesture('cancel', event); drag.current = null; }}
      onPointerLeave={() => { if (!drag.current) send({ type: 'orbit-character-pointer-cancel' }); }}
      onClick={event => { if (event.detail === 0) void command('reaction').catch(() => {}); }} />}
    {status === 'loading' && <span className="dot-character-loading" role="status" aria-label="Loading character" />}
    {status === 'failed' && <span className="dot-character-error" role="alert">{failure}</span>}
  </span>;
});

export function Character(props: CharacterProps) { return <CharacterSurface {...props} />; }

/** Static lists share one serialized portrait renderer; no per-avatar WASM. */
export function NativeAvatar({ preset = 'alfred', state, snapshot, className, onSnapshot }: { preset?: string; state?: string; snapshot?: string | null; className?: string; onSnapshot?: (png: string) => void }) {
  const [portrait, setPortrait] = useState(() => snapshot || cachedNativePortrait(preset, state));
  const callback = useRef(onSnapshot); callback.current = onSnapshot;
  useEffect(() => {
    let alive = true;
    const known = snapshot || cachedNativePortrait(preset, state);
    setPortrait(known);
    if (!known) void nativePortrait(preset, state).then(image => { if (alive) { setPortrait(image); callback.current?.(image); } }).catch(() => {});
    return () => { alive = false; };
  }, [preset, state, snapshot]);
  return portrait ? <img className={className} src={portrait} alt="" /> : <span className={`dot-native-portrait-pending ${className ?? ''}`} aria-hidden="true" />;
}
export default Character;
