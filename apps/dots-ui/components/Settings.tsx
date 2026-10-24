'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Bell, Blocks, BookOpen, Bot, Brain, ChartNoAxesCombined,
  Check, ChevronRight, Download, KeyRound, Keyboard, Loader2, Monitor,
  Palette, PanelLeftClose, PanelLeftOpen, Pause, Play, RefreshCw, Search,
  ShieldCheck, SlidersHorizontal, Trash2, UserRound, X,
} from 'lucide-react';
import {
  api, post, type AuthSettings, type AIProvider, type UsageSummary,
  type Dot, type DotMemory, type Environment,
} from '../lib/api';
import { savePreferences, type Preferences } from '../lib/preferences';
import { usePreferences } from '../lib/usePreferences';
import { DOT_STATUS_LABELS, type DotMenuAction } from '../lib/dot-lifecycle';
import { DotAvatar } from './DotAvatar';
import type { DotProfile } from '../lib/dot-profile';
import { DOT_COLORS } from '../lib/dot-profile';

const SECTIONS = [
  { id: 'general', label: '일반', icon: SlidersHorizontal, group: '개인' },
  { id: 'profile', label: '프로필', icon: UserRound, group: '개인' },
  { id: 'appearance', label: '외형', icon: Palette, group: '개인' },
  { id: 'notifications', label: '알림', icon: Bell, group: '개인' },
  { id: 'memory', label: '기억', icon: Brain, group: '개인' },
  { id: 'shortcuts', label: '단축키', icon: Keyboard, group: '개인' },
  { id: 'environments', label: '환경', icon: Monitor, group: '컴퓨터 및 환경' },
  { id: 'safety', label: '안전 및 권한', icon: ShieldCheck, group: '컴퓨터 및 환경' },
  { id: 'accounts', label: 'AI 계정', icon: KeyRound, group: '통합' },
  { id: 'agent', label: '실행 설정', icon: Bot, group: '통합' },
  { id: 'connections', label: '연결', icon: Blocks, group: '통합' },
  { id: 'skills', label: '스킬', icon: BookOpen, group: '통합' },
  { id: 'usage', label: '사용량', icon: ChartNoAxesCombined, group: '고급' },
  { id: 'import', label: '가져오기', icon: Download, group: '고급' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];
const headings: Record<SectionId, { title: string; description: string }> = {
  general: { title: '일반', description: '대화와 화면의 기본 동작을 설정합니다.' },
  profile: { title: '프로필', description: 'Dot의 이름과 모습을 바꿉니다.' },
  appearance: { title: '외형', description: '테마와 화면 움직임을 조정합니다.' },
  notifications: { title: '알림', description: '작업이 끝났을 때 알림을 받습니다.' },
  memory: { title: '기억', description: 'Dot이 기억해야 할 정보를 관리합니다.' },
  shortcuts: { title: '단축키', description: '대화에서 사용하는 바로가기입니다.' },
  environments: { title: '환경', description: '각 Dot의 컴퓨터 상태를 확인하고 제어합니다.' },
  safety: { title: '안전 및 권한', description: '실행 환경과 권한을 확인합니다.' },
  accounts: { title: 'AI 계정', description: '사용할 AI 제공자와 모델을 연결합니다.' },
  agent: { title: '실행 설정', description: '작업에 사용할 기본 AI와 모델을 고릅니다.' },
  connections: { title: '연결', description: '플러그인과 앱 연결을 관리합니다.' },
  skills: { title: '스킬', description: '필요한 작업 절차를 찾아보고 확인합니다.' },
  usage: { title: '사용량', description: '모델이 보고한 입력과 출력을 확인합니다.' },
  import: { title: '가져오기', description: '문서와 자료를 모아서 작업에 활용합니다.' },
};

type Props = {
  dotId?: string;
  onClose: () => void;
  profile: DotProfile;
  onProfile: (profile: DotProfile) => void;
  dots: Dot[];
  onDotAction: (dot: Dot, action: DotMenuAction) => void;
};

function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} className="settings-switch" onClick={onChange}><span /></button>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label"><strong>{label}</strong>{description && <p>{description}</p>}</div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return <section className="settings-card">{title && <h2>{title}</h2>}{children}</section>;
}

export default function Settings({ dotId = 'dot-1', onClose, profile, onProfile, dots, onDotAction }: Props) {
  const [section, setSection] = useState<SectionId>('general');
  const [query, setQuery] = useState('');
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [settings, setSettings] = useState<AuthSettings | null>(null);
  const [provider, setProvider] = useState<AIProvider>('codex');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [notification, setNotification] = useState<NotificationPermission | 'unsupported'>('default');
  const [memories, setMemories] = useState<DotMemory[]>([]);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [envBusy, setEnvBusy] = useState(false);

  const preferences = usePreferences();
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const activeDot = dots.find(d => d.id === dotId);

  useEffect(() => { setNotification(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission); }, []);

  const refresh = async () => {
    const [auth, tokens] = await Promise.allSettled([api<AuthSettings>('/settings'), api<UsageSummary>('/usage')]);
    if (tokens.status === 'fulfilled') setUsage(tokens.value); else setUsage(null);
    if (auth.status === 'rejected') throw auth.reason;
    setSettings(auth.value); setProvider(auth.value.provider); setModel(auth.value.model); return auth.value;
  };

  const refreshMemories = async () => {
    try { const data = await api<{ memories: DotMemory[] }>('/dots/' + dotId + '/memories'); setMemories(data.memories); } catch { setMemories([]); }
  };

  const refreshEnvironments = async () => {
    setEnvBusy(true);
    try { const data = await api<{ environments: Environment[] }>('/environments'); setEnvironments(data.environments); } catch { setEnvironments([]); }
    finally { setEnvBusy(false); }
  };

  useEffect(() => {
    refresh().catch(e => setError(e.message));
    refreshEnvironments();
  }, []);
  useEffect(() => { if (section === 'memory') refreshMemories(); }, [section, dotId]);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);

  const save = async () => {
    setBusy(true); setError(''); setSaved('');
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify({ provider, model, ...(key ? { api_key: key } : {}) }) });
      setKey(''); await refresh(); setSaved('AI 설정을 저장했습니다.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const addMemory = async () => {
    const text = memoryDraft.trim();
    if (!text || memoryBusy) return;
    setMemoryBusy(true);
    try { await api('/dots/' + dotId + '/memories', post({ text })); setMemoryDraft(''); await refreshMemories(); setSaved('기억을 추가했습니다.'); }
    catch (e) { setError((e as Error).message); } finally { setMemoryBusy(false); }
  };

  const removeMemory = async (id: string) => {
    setMemoryBusy(true);
    try { await api('/dots/' + dotId + '/memories/' + id, { method: 'DELETE' }); await refreshMemories(); setSaved('기억을 삭제했습니다.'); }
    catch (e) { setError((e as Error).message); } finally { setMemoryBusy(false); }
  };

  const preference = (patch: Partial<Preferences>) => {
    try { savePreferences({ ...preferences, ...patch }); setSaved('설정을 저장했습니다.'); }
    catch { setError('브라우저에 설정을 저장하지 못했습니다.'); }
  };

  const matches = SECTIONS.filter(s => `${s.label} ${s.group} ${headings[s.id].description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const active = matches.find(s => s.id === section) ?? matches[0];
  const dirty = !!settings && (provider !== settings.provider || model !== settings.model || !!key);
  const aiSection = active?.id === 'accounts' || active?.id === 'agent';
  const groups = [...new Set(matches.map(s => s.group))];

  return (
    <dialog ref={dialog} className={'settings-workspace' + (navCollapsed ? ' settings-nav-collapsed' : '')} aria-label="Dots 설정" onCancel={e => { e.preventDefault(); onClose(); }} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); search.current?.focus(); } }}>
      <aside className="settings-nav">
        <header><h2>설정</h2><button className="icon-button" aria-label="접기" onClick={() => setNavCollapsed(true)}><PanelLeftClose size={18} /></button></header>
        <button className="settings-back" onClick={onClose}><ArrowLeft size={18} />대화로 돌아가기</button>
        <label className="settings-search"><Search size={16} /><input ref={search} aria-label="설정 검색" placeholder="설정 검색" value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="icon-button" onClick={() => setQuery('')}><X size={14} /></button>}</label>
        <nav aria-label="설정 메뉴">
          {groups.map(group => (
            <div className="settings-nav-group" key={group}>
              <small>{group}</small>
              {matches.filter(s => s.group === group).map(s => (
                <button key={s.id} className={active?.id === s.id ? 'active' : undefined} aria-current={active?.id === s.id ? 'page' : undefined} onClick={() => { setSection(s.id); setSaved(''); }}>
                  <s.icon size={17} /><span>{s.label}</span><ChevronRight size={14} />
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="settings-main">
        <div className="settings-main-toolbar">
          {navCollapsed && <button className="icon-button" onClick={() => setNavCollapsed(false)}><PanelLeftOpen size={20} /></button>}
          <button className="icon-button" aria-label="닫기" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="settings-content">
          {!active ? <div className="settings-empty"><Search size={26} /><h2>일치하는 설정이 없어요</h2></div> : <>
            <header className="settings-page-heading"><span>설정 <ChevronRight size={12} /> {active.label}</span><h1>{headings[active.id].title}</h1><p>{headings[active.id].description}</p></header>
            {active.id === 'general' && <Card title="대화와 화면">
              <Row label="메시지 전송 키" description="Shift + Enter는 항상 줄을 바꿉니다.">
                <select value={preferences.sendWith} onChange={e => preference({ sendWith: e.target.value as Preferences['sendWith'] })}><option value="enter">Enter</option><option value="modifier-enter">⌘ / Ctrl + Enter</option></select>
              </Row>
              <Row label="시작 시 컴퓨터 표시"><Switch checked={preferences.showComputer} onChange={() => preference({ showComputer: !preferences.showComputer })} /></Row>
              <Row label="애니메이션 줄이기"><Switch checked={preferences.reduceMotion} onChange={() => preference({ reduceMotion: !preferences.reduceMotion })} /></Row>
            </Card>}
            {active.id === 'profile' && <Card title="프로필">
              <div style={{ padding: '10px 0 18px', textAlign: 'center' }}><DotAvatar profile={profile} size={80} /><p style={{ marginTop: 12, fontWeight: 600 }}>{profile.name}</p></div>
              <Row label="이름"><input value={profile.name} onChange={e => onProfile({ ...profile, name: e.target.value })} maxLength={32} /></Row>
              <Row label="색상"><div style={{ display: 'flex', gap: 8 }}>{DOT_COLORS.map(c => <button key={c.id} title={c.label} aria-label={c.label} onClick={() => onProfile({ ...profile, color: c.id })} style={{ width: 28, height: 28, borderRadius: '50%', border: profile.color === c.id ? '2px solid var(--ink)' : '2px solid transparent', background: c.value }} />)}</div></Row>
            </Card>}
            {active.id === 'appearance' && <Card title="화면">
              <Row label="테마"><select value={profile.theme} onChange={e => onProfile({ ...profile, theme: e.target.value as DotProfile['theme'] })}><option value="dark">다크</option><option value="light">라이트</option></select></Row>
              <Row label="애니메이션 줄이기"><Switch checked={preferences.reduceMotion} onChange={() => preference({ reduceMotion: !preferences.reduceMotion })} /></Row>
            </Card>}
            {active.id === 'notifications' && <Card title="브라우저 알림">
              <Row label="작업 완료 알림"><Switch checked={preferences.runNotifications} onChange={() => preference({ runNotifications: !preferences.runNotifications })} /></Row>
              <Row label="알림 소리"><Switch checked={preferences.notificationSound} disabled={!preferences.runNotifications} onChange={() => preference({ notificationSound: !preferences.notificationSound })} /></Row>
              <div className="settings-row"><button className="button light" disabled={notification !== 'granted'} onClick={() => new Notification('Dots', { body: '테스트' })}>테스트 알림</button></div>
            </Card>}
            {active.id === 'memory' && <Card title={activeDot ? activeDot.name + '의 기억' : '기억'}>
              <div className="settings-memory-input"><input value={memoryDraft} onChange={e => setMemoryDraft(e.target.value)} placeholder="예: 보고서는 항상 PDF로 남긴다" /><button className="button" disabled={memoryBusy || !memoryDraft.trim()} onClick={() => void addMemory()}>{memoryBusy ? <Loader2 size={15} className="spin" /> : '추가'}</button></div>
              {memories.length === 0 ? <p className="settings-help">아직 저장된 기억이 없습니다.</p> : <ul className="settings-memory-list">{memories.map(m => <li key={m.id}><span>{m.text}</span><button className="icon-button" onClick={() => void removeMemory(m.id)}><Trash2 size={15} /></button></li>)}</ul>}
            </Card>}
            {active.id === 'shortcuts' && <Card title="대화">{[['메시지 전송', preferences.sendWith === 'enter' ? 'Enter' : '⌘ / Ctrl + Enter'], ['줄바꿈', 'Shift + Enter']].map(([l, s]) => <Row key={l} label={l}><kbd>{s}</kbd></Row>)}</Card>}
            {active.id === 'environments' && <Card title="Dot 환경">
              {envBusy && environments.length === 0 ? <p className="settings-help">불러오는 중…</p> : environments.length === 0 ? <p className="settings-help">등록된 환경이 없습니다.</p> : <ul className="settings-env-list">{environments.map(env => {
                const dot = dots.find(d => d.id === env.dot_id);
                const paused = env.dot_status === 'PAUSED';
                return <li key={env.dot_id}><div className="settings-env-info"><DotAvatar profile={dot || profile} size={32} /><div><strong>{env.dot_name}</strong><p>{DOT_STATUS_LABELS[env.dot_status]} · {env.connected ? '온라인' : '오프라인'}</p></div></div><div className="settings-env-actions">
                  {paused ? <button className="icon-button" onClick={() => dot && onDotAction(dot, 'resume')}><Play size={16} /></button> : <button className="icon-button" onClick={() => dot && onDotAction(dot, 'pause')}><Pause size={16} /></button>}
                  <button className="icon-button" onClick={() => dot && onDotAction(dot, 'reboot')}><RefreshCw size={16} /></button>
                  <button className="icon-button" onClick={() => dot && onDotAction(dot, 'rename')}><ArrowLeft size={16} style={{ transform: 'rotate(45deg)' }} /></button>
                  <button className="icon-button" style={{ color: 'var(--danger)' }} onClick={() => dot && onDotAction(dot, 'delete')}><Trash2 size={16} /></button>
                </div></li>;
              })}</ul>}
              <button className="button light" onClick={() => void refreshEnvironments()}><RefreshCw size={15} /> 새로고침</button>
            </Card>}
            {active.id === 'safety' && <Card title="권한">
              <Row label="격리 실행" description="모든 작업은 Dot의 격리된 Linux 데스크톱에서 실행됩니다."><span className="settings-badge ok">사용 중</span></Row>
              <Row label="사용자 Mac 접근" description="로컬 기기 파일이나 화면에 직접 접근하는 기능은 아직 제공하지 않습니다."><span className="settings-badge">미지원</span></Row>
            </Card>}
            {active.id === 'accounts' && <Card title="AI 제공자">
              {(['codex', 'openai'] as const).map(p => <div key={p} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                <strong>{p === 'codex' ? 'Codex' : 'OpenAI API'}</strong>
                <p className="settings-help">{p === 'codex' ? '이 기기의 ChatGPT 로그인' : '프로젝트 API 키로 연결'}</p>
                <span className={'settings-badge ' + ((p === 'codex' ? settings?.codex_connected : settings?.openai_configured) ? 'ok' : '')}>{(p === 'codex' ? settings?.codex_connected : settings?.openai_configured) ? '연결됨' : '연결 필요'}</span>
                <button className={'button light ' + (provider === p ? '' : '')} style={{ marginTop: 8 }} onClick={() => setProvider(p)}>{provider === p ? <Check size={14} /> : null} 기본 제공자로 선택</button>
              </div>)}
            </Card>}
            {active.id === 'agent' && <Card title="실행 설정">
              <Row label="AI 제공자"><select value={provider} onChange={e => setProvider(e.target.value as AIProvider)}><option value="codex">Codex</option><option value="openai">OpenAI API</option></select></Row>
              <Row label="모델"><input value={model} onChange={e => { setModel(e.target.value); setSaved(''); }} placeholder="모델 이름" /></Row>
            </Card>}
            {active.id === 'connections' && <Card title="연결"><p className="settings-help">플러그인 연결 UI는 준비 중입니다.</p></Card>}
            {active.id === 'skills' && <Card title="스킬"><p className="settings-help">스킬 카탈로그는 준비 중입니다.</p></Card>}
            {active.id === 'usage' && <Card title="누적 토큰"><p className="settings-help">모델이 보고한 사용량입니다.</p>{usage?.providers.map(row => <div key={row.provider} style={{ marginBottom: 12 }}><strong>{row.provider}</strong><p>{row.input_tokens.toLocaleString()} in / {row.output_tokens.toLocaleString()} out</p></div>)}</Card>}
            {active.id === 'import' && <Card title="가져오기"><p className="settings-help">외부 파일 업로드와 대화 기록 가져오기는 아직 지원하지 않습니다.</p></Card>}
          </>}
          {error && <p className="settings-error">{error}</p>}
          <footer className="settings-save"><span>{saved || (dirty ? '저장하지 않은 AI 설정이 있습니다.' : '')}</span>{aiSection && <button className="button" disabled={busy || !dirty} onClick={save}>{busy ? '저장 중…' : '변경 사항 저장'}</button>}</footer>
        </div>
      </main>
    </dialog>
  );
}
