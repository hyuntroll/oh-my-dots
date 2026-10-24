export type Preferences = { sendWith: 'enter' | 'modifier-enter'; showComputer: boolean; reduceMotion: boolean; runNotifications: boolean; notificationSound: boolean };
export const DEFAULT_PREFERENCES: Preferences = { sendWith: 'enter', showComputer: true, reduceMotion: false, runNotifications: false, notificationSound: true };
export const PREFERENCES_KEY = 'ohmydots-preferences';
export function parsePreferences(raw: string | null): Preferences {
  try {
    const value = JSON.parse(raw || '{}');
    return { sendWith: value?.sendWith === 'modifier-enter' ? 'modifier-enter' : 'enter',
      showComputer: typeof value?.showComputer === 'boolean' ? value.showComputer : true,
      reduceMotion: value?.reduceMotion === true,
      runNotifications: value?.runNotifications === true,
      notificationSound: value?.notificationSound === false ? false : true };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}
export function readPreferences(): Preferences {
  try { return parsePreferences(localStorage.getItem(PREFERENCES_KEY)); }
  catch { return { ...DEFAULT_PREFERENCES }; }
}
export function savePreferences(value: Preferences) {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event('ohmydots-preferences'));
}
/** Server-stored preferences win on boot so every browser for this account agrees. */
export function mergeServerPreferences(local: Preferences, stored: unknown): Preferences {
  if (!stored || typeof stored !== 'object') return local;
  return parsePreferences(JSON.stringify(stored));
}
export function shouldSend(key: string, shift: boolean, modifier: boolean, composing: boolean, preference: Preferences['sendWith']): boolean {
  return key === 'Enter' && !shift && !composing && (preference === 'enter' || modifier);
}
export function shouldNotify(previous: string | undefined, next: string | undefined, enabled: boolean, visible: boolean): boolean {
  if (!enabled || visible) return false;
  const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'];
  if (!next || !terminal.includes(next)) return false;
  // Only a transition we actually watched counts; a run that is already finished when
  // the page loads must not raise a notification.
  return !!previous && !terminal.includes(previous);
}
