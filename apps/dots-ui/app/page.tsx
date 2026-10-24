'use client';
import { useEffect, useState } from 'react';
import { api, post, type Dot, type PreferencesPayload } from '../lib/api';
import { readPreferences, savePreferences, mergeServerPreferences } from '../lib/preferences';
import { usePreferences } from '../lib/usePreferences';
import { DEFAULT_PROFILE, PROFILE_KEY, parseDotProfile, saveDotProfile, type DotProfile } from '../lib/dot-profile';
import { type DotMenuAction } from '../lib/dot-lifecycle';
import DotSidebar from '../components/DotSidebar';
import DotContext from '../components/DotContext';
import DotMenu from '../components/DotMenu';
import { ConfirmDialog, RenameDialog, dialogProps } from '../components/DotDialogs';
import Settings from '../components/Settings';
import { DotAvatar } from '../components/DotAvatar';
import Chat from '../components/Chat';
import ComputerView from '../components/ComputerView';
import FloatingComputer from '../components/FloatingComputer';

export default function Home() {
  const [loaded, setLoaded] = useState(false);
  const [dots, setDots] = useState<Dot[]>([]);
  const [activeDotId, setActiveDotId] = useState('');
  const [profile, setProfile] = useState<DotProfile>(DEFAULT_PROFILE);
  const [contextOpen, setContextOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState<'chat' | 'computer'>('chat');
  const [pipOpen, setPipOpen] = useState(false);
  const [dotMenu, setDotMenu] = useState<{ dot: Dot; x: number; y: number } | null>(null);
  const [dotDialog, setDotDialog] = useState<null | 'rename' | 'pause' | 'resume' | 'reboot' | 'delete'>(null);
  const [lifecycleDot, setLifecycleDot] = useState<Dot | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState('');
  const [error, setError] = useState('');
  const preferences = usePreferences();

  useEffect(() => {
    const boot = async () => {
      try {
        await api('/session');
        try {
          const stored = await api<PreferencesPayload>('/settings/preferences');
          const merged = mergeServerPreferences(readPreferences(), stored);
          savePreferences(merged);
        } catch { /* ignore */ }
        const registered = await api<Dot[]>('/dots');
        setDots(registered);
        if (registered.length) setActiveDotId(registered[0].id);
        const saved = localStorage.getItem(PROFILE_KEY);
        setProfile(parseDotProfile(saved));
      } catch (e) { setError((e as Error).message); }
      finally { setLoaded(true); }
    };
    void boot();
  }, []);

  useEffect(() => {
    if (profile.theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  }, [profile.theme]);

  const handleProfile = (p: DotProfile) => { setProfile(p); saveDotProfile(p); };

  const applyDot = (dot: Dot) => setDots(prev => prev.map(d => d.id === dot.id ? { ...d, ...dot } : d));

  const handleDotAction = (dot: Dot, action: DotMenuAction) => {
    if (action === 'pin') {
      void api<Dot>('/dots/' + dot.id + '/pin', post({ pinned: !dot.pinned })).then(applyDot).catch(e => setError(e.message));
      return;
    }
    if (action === 'move') {
      if (dot.id !== activeDotId) setActiveDotId(dot.id);
      setContextOpen(false);
      return;
    }
    setLifecycleDot(dot); setLifecycleError(''); setDotDialog(action);
  };

  const confirmAction = async (name?: string) => {
    const dot = lifecycleDot;
    if (!dot) return;
    setLifecycleBusy(true); setLifecycleError('');
    try {
      if (dotDialog === 'rename') applyDot(await api<Dot>('/dots/' + dot.id, { method: 'PATCH', body: JSON.stringify({ name }) }));
      else if (dotDialog === 'pause') applyDot(await api<Dot>('/dots/' + dot.id + '/pause', post()));
      else if (dotDialog === 'resume') applyDot(await api<Dot>('/dots/' + dot.id + '/resume', post()));
      else if (dotDialog === 'reboot') await api('/dots/' + dot.id + '/reboot', post(), 150_000);
      else if (dotDialog === 'delete') {
        await api('/dots/' + dot.id, { method: 'DELETE' });
        const remaining = dots.filter(d => d.id !== dot.id);
        setDots(remaining);
        if (dot.id === activeDotId && remaining.length) setActiveDotId(remaining[0].id);
      }
      setDotDialog(null); setLifecycleDot(null);
    } catch (e) { setLifecycleError((e as Error).message); }
    finally { setLifecycleBusy(false); }
  };

  const activeDot = dots.find(d => d.id === activeDotId) || null;

  if (!loaded) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>불러오는 중…</div>;
  if (error) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center', color: 'var(--danger)' }}>{error}</div>;

  return (
    <div className="dots-shell">
      <DotSidebar
        profile={profile}
        dots={dots}
        activeDotId={activeDotId}
        onDot={setActiveDotId}
        onDotMenu={(dot, x, y) => setDotMenu({ dot, x, y })}
        onAddDot={() => {}}
        onFiles={() => {}}
        onActivity={() => {}}
        onSettings={() => setSettingsOpen(true)}
      />
      <main className="dots-main">
        <header className="dots-main-header">
          {activeDot && <><DotAvatar profile={activeDot} size={28} /><h1>{activeDot.name}</h1></>}
          <span className="spacer" />
          {mode === 'computer' && <button className="button light" onClick={() => setMode('chat')}>대화로 돌아가기</button>}
          <button className="icon-button" aria-label="Dot 정보" onClick={() => setContextOpen(!contextOpen)}>ℹ</button>
        </header>
        {activeDot ? (
          mode === 'computer' ? <ComputerView dotId={activeDotId} onPip={() => setPipOpen(true)} /> : <Chat dotId={activeDotId} dotName={activeDot.name} />
        ) : <section className="dots-chat"><p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 80 }}>Dot을 선택해 주세요.</p></section>}
      </main>
      {contextOpen && activeDot && <DotContext
        dot={activeDot}
        onMenu={(x, y) => setDotMenu({ dot: activeDot, x, y })}
        onComputer={() => setMode('computer')}
        onPip={() => setPipOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />}
      {pipOpen && activeDot && <FloatingComputer dotId={activeDotId} onClose={() => setPipOpen(false)} />}
      {dotMenu && <DotMenu dot={dotMenu.dot} x={dotMenu.x} y={dotMenu.y} onAction={action => handleDotAction(dotMenu.dot, action)} onClose={() => setDotMenu(null)} />}
      {dotDialog === 'rename' && lifecycleDot && <RenameDialog name={lifecycleDot.name} busy={lifecycleBusy} error={lifecycleError} onSave={name => void confirmAction(name)} onClose={() => setDotDialog(null)} />}
      {dotDialog && dotDialog !== 'rename' && lifecycleDot && <ConfirmDialog {...dialogProps[dotDialog](lifecycleDot.name)} danger={dotDialog === 'delete'} busy={lifecycleBusy} error={lifecycleError} onConfirm={() => void confirmAction()} onClose={() => setDotDialog(null)} />}
      {settingsOpen && <Settings dotId={activeDotId} onClose={() => setSettingsOpen(false)} profile={profile} onProfile={handleProfile} dots={dots} onDotAction={handleDotAction} />}
    </div>
  );
}
