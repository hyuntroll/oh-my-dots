'use client';
import { useEffect, useState } from 'react';
import { DEFAULT_PREFERENCES, readPreferences } from './preferences';
export function usePreferences() {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  useEffect(() => {
    const sync = () => setPreferences(readPreferences());
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('ohmydots-preferences', sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('ohmydots-preferences', sync); };
  }, []);
  return preferences;
}
