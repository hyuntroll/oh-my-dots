import type { Run } from './api';
import type { Execution } from './execution';
export type DotActivity = 'Ready' | 'Working' | 'Searching' | 'Creating' | 'Payment' | 'Thinking' | 'NeedsInput' | 'Paused' | 'Error';
export const ACTIVITY_KIND: Record<DotActivity, number> = { Working: 1, Searching: 2, Creating: 3, Payment: 4, Thinking: 5, NeedsInput: 6, Ready: 7, Paused: 8, Error: 9 };
export function dotActivity(run?: Run, execution?: Execution): DotActivity {
  if (!run) return 'Ready';
  if (run.status === 'FAILED') return 'Error';
  if (run.status === 'WAITING_USER') return run.wait_reason === 'CONTROL' ? 'Paused' : 'NeedsInput';
  if (run.status === 'CANCELLED') return 'Paused';
  if (run.status === 'COMPLETED') return 'Ready';
  const runningTool = execution?.tools?.findLast(e => e.type === 'tool.started' && !execution.tools?.some(later => later.sequence > e.sequence && later.payload.call_id === e.payload.call_id && later.type !== 'tool.started'));
  const name = runningTool?.summary.toLowerCase() || '';
  if (/search|browse|find/.test(name)) return 'Searching';
  if (/write|create|edit|save/.test(name)) return 'Creating';
  return runningTool ? 'Working' : 'Thinking';
}
export function reduceMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reduceMotion === 'true'; }
export function encodeBytes(bytes: Uint8Array) { let text = ''; for (const b of bytes) text += String.fromCharCode(b); return btoa(text); }
export function decodeBytes(value?: string) { try { return value ? Uint8Array.from(atob(value), c => c.charCodeAt(0)) : new Uint8Array(); } catch { return new Uint8Array(); } }
