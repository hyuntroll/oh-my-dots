export const HEROES = [
  { id: 'blue_beret', title: 'Felipe' }, { id: 'alfred', title: 'Alfred' },
  { id: 'purple_heart', title: 'Jojo' }, { id: 'lime_frog', title: 'Todd' },
  { id: 'coral_monocle', title: 'Iris' }, { id: 'gus', title: 'Thelma' },
  { id: 'blue_spectacles', title: 'Josh' }, { id: 'lime_headphones', title: 'Iggy' },
] as const;
export const CATEGORY_NAMES = ['Shape', 'Color', 'Eyes', 'Eyewear', 'Accessories'];
export const ACTIVITY = { None: 0, Working: 1, Searching: 2, Creating: 3, Payment: 4, Thinking: 5, NeedsInput: 6, Ready: 7, Paused: 8, Error: 9 } as const;
export type CharacterActivity = { kind: number; turnId?: string | null };
export type CharacterOption = { id: string; title: string; selected: boolean; available: boolean; retired?: boolean; thumbnail?: string; color?: string; colors?: { id: string; title: string; color: string }[]; colorOverride?: string };
export type CharacterPreview = { state: Uint8Array; depth: number; catalog: CharacterOption[][]; presets: { id: string; title: string; thumbnail?: string | null }[]; preparation?: { pending: boolean; background: boolean; failed: boolean } };
export type CharacterReply = { error?: boolean; rejected?: boolean; state?: Uint8Array; png?: Uint8Array; reaction?: number; preview?: CharacterPreview };
export type CharacterHandle = { command: (action: string, fields?: Record<string, unknown>) => Promise<CharacterReply> };

export function encodeAppearance(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
export function decodeAppearance(value?: string): Uint8Array {
  if (!value) return new Uint8Array();
  if (value.length > 87384) throw new Error('The saved character exceeds the native state limit.');
  let decoded: string;
  try { decoded = atob(value); } catch { throw new Error('The saved character is not valid base64.'); }
  if (decoded.length > 65536) throw new Error('The saved character exceeds the native state limit.');
  return Uint8Array.from(decoded, byte => byte.charCodeAt(0));
}
export function pngDataUrl(bytes: Uint8Array): string { return `data:image/png;base64,${encodeAppearance(bytes)}`; }
export function reducedMotion(): boolean { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

/** Whole hero portraits are not in the shipped option-thumbnail index. Generate
 * neutral portraits with one shared native renderer, never one WebGL per row. */
const portraitCache = new Map<string, string>();
const portraitPending = new Map<string, Promise<string>>();
let portraitQueue: Promise<unknown> = Promise.resolve();
let portraitFrame: HTMLIFrameElement | undefined;
let portraitFrameReady: Promise<HTMLIFrameElement> | undefined;
let portraitIdle: ReturnType<typeof setTimeout> | undefined;
let portraitSerial = 0;
export function portraitKey(preset = 'alfred', state?: string): string { return state || `preset:${preset}`; }
export function cachedNativePortrait(preset = 'alfred', state?: string): string | undefined { return portraitCache.get(portraitKey(preset, state)); }

function disposePortraitRenderer() {
  portraitFrame?.remove();
  portraitFrame = undefined;
  portraitFrameReady = undefined;
}
export function releaseNativePortraitRenderer(): void {
  if (portraitPending.size !== 0) return;
  clearTimeout(portraitIdle);
  disposePortraitRenderer();
}
function ensurePortraitRenderer(): Promise<HTMLIFrameElement> {
  if (portraitFrameReady) return portraitFrameReady;
  portraitFrameReady = new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    portraitFrame = frame;
    frame.title = 'Native character portrait renderer';
    frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    // The original engine needs a real drawable viewport; display:none would
    // suppress admission. This single offscreen frame is released after idle.
    Object.assign(frame.style, { position: 'fixed', left: '-4096px', top: '0', width: '256px', height: '256px', opacity: '0', pointerEvents: 'none', border: '0' });
    const timer = setTimeout(() => { disposePortraitRenderer(); reject(new Error('Portrait frame load timed out.')); }, 15000);
    frame.onload = () => { clearTimeout(timer); resolve(frame); };
    frame.onerror = () => { clearTimeout(timer); disposePortraitRenderer(); reject(new Error('Portrait frame could not load.')); };
    frame.src = '/dot-engine/fd5f2a1997e55d5f/frame.html';
    document.body.append(frame);
  });
  return portraitFrameReady;
}
async function renderNativePortrait(preset: string, state?: string): Promise<string> {
  const bytes = decodeAppearance(state);
  const frame = await ensurePortraitRenderer();
  const ownerId = `native-portrait-${++portraitSerial}`;
  return new Promise((resolve, reject) => {
    let requested = false;
    const finish = (image?: string, error?: Error) => {
      clearTimeout(timer); window.removeEventListener('message', receive);
      if (error) { disposePortraitRenderer(); reject(error); } else resolve(image!);
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.ownerId !== ownerId) return;
      const data = event.data;
      if (data.type === 'orbit-character' && data.status === 'failed') finish(undefined, new Error(`Native portrait failed (${data.reason ?? 'runtime'}).`));
      if (data.type === 'orbit-character' && data.status === 'ready' && !requested) {
        requested = true;
        frame.contentWindow?.postMessage({ type: 'orbit-character-editor', ownerId, id: 1, action: 'snapshot' }, location.origin);
      }
      if (data.type === 'orbit-character-editor' && data.id === 1) {
        if (data.png instanceof Uint8Array && !data.error) finish(pngDataUrl(data.png));
        else finish(undefined, new Error('Native portrait did not return PNG bytes.'));
      }
    };
    const timer = setTimeout(() => finish(undefined, new Error('Native portrait preparation timed out.')), 45000);
    window.addEventListener('message', receive);
    frame.contentWindow?.postMessage({ type: 'orbit-character', ownerId, presentation: 'editor', state: bytes, preset, active: true, reducedMotion: true, requestReady: true, framing: 'content' }, location.origin);
  });
}
export function nativePortrait(preset = 'alfred', state?: string): Promise<string> {
  const key = portraitKey(preset, state);
  const cached = portraitCache.get(key); if (cached) return Promise.resolve(cached);
  const pending = portraitPending.get(key); if (pending) return pending;
  clearTimeout(portraitIdle);
  const task = portraitQueue.catch(() => {}).then(() => renderNativePortrait(preset, state)).then(image => {
    portraitCache.set(key, image);
    if (portraitCache.size > 100) portraitCache.delete(portraitCache.keys().next().value!);
    return image;
  }).finally(() => {
    portraitPending.delete(key);
    if (portraitPending.size === 0) portraitIdle = setTimeout(disposePortraitRenderer, 10000);
  });
  portraitPending.set(key, task); portraitQueue = task;
  return task;
}
