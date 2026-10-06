export type Preferences = { sendWith: 'enter' | 'modifier-enter'; showComputer: boolean; reduceMotion: boolean };
export const DEFAULT_PREFERENCES: Preferences = { sendWith: 'enter', showComputer: true, reduceMotion: false };
export const PREFERENCES_KEY = 'ohmydots-preferences';
export function parsePreferences(raw: string | null): Preferences {
  try {
    const value = JSON.parse(raw || '{}');
    return { sendWith: value?.sendWith === 'modifier-enter' ? 'modifier-enter' : 'enter',
      showComputer: typeof value?.showComputer === 'boolean' ? value.showComputer : true,
      reduceMotion: value?.reduceMotion === true };
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
export function shouldSend(key: string, shift: boolean, modifier: boolean, composing: boolean, preference: Preferences['sendWith']): boolean {
  return key === 'Enter' && !shift && !composing && (preference === 'enter' || modifier);
}
