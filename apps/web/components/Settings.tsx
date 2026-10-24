'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowUpRight, Bell, Blocks, BookOpen, Bot, Brain, ChartNoAxesCombined,
  Check, ChevronRight, Download, KeyRound, Keyboard, Loader2, Monitor, Moon,
  Palette, PanelLeftClose, PanelLeftOpen, Pause, Play, RefreshCw, Search, ShieldCheck,
  SlidersHorizontal, Trash2, UserRound, X,
} from 'lucide-react';
import {
  api, post, type AuthSettings, type AIProvider, type Computer, type UsageSummary,
  type Dot, type DotMemory, type Environment,
} from '../lib/api';
import { savePreferences, type Preferences } from '../lib/preferences';
import { usePreferences } from '../lib/usePreferences';
import { DOT_STATUS_LABELS, type DotMenuAction } from '../lib/dot-lifecycle';
import SkillsCatalog from './SkillsCatalog';
import ModelPicker from './ModelPicker';
import Connections from './Connections';
import { DotAvatar, IdentityEditor } from './DotIdentity';
import type { DotProfile } from '../lib/dot-profile';

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
  onOnboarding: () => void;
  dotId?: string;
  onClose: () => void;
  onSaved: () => void;
  onOpenComputer: (state: Computer) => void;
  onCompose: (prompt: string) => void;
  profile: DotProfile;
  onProfile: (profile: DotProfile) => void;
  dots: Dot[];
  onDotAction: (dot: Dot, action: DotMenuAction) => void;
  onFiles: () => void;
  onHome: () => void;
  onActivity: () => void;
};

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      className="settings-switch"
      onClick={onChange}
    >
      <span />
    </button>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <strong>{label}</strong>
        {description && <p>{description}</p>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="settings-card">
      {title && <h2 className="settings-card-title">{title}</h2>}
      {children}
    </section>
  );
}

export default function Settings({
  onOnboarding, dotId = 'dot-1', onClose, onSaved,
  onOpenComputer, onCompose, profile, onProfile, dots, onDotAction,
  onFiles, onHome, onActivity,
}: Props) {
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
  const [usageError, setUsageError] = useState(false);
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
    const [auth, tokens] = await Promise.allSettled([
      api<AuthSettings>('/settings'),
      api<UsageSummary>('/usage'),
    ]);
    if (tokens.status === 'fulfilled') { setUsage(tokens.value); setUsageError(false); }
    else setUsageError(true);
    if (auth.status === 'rejected') throw auth.reason;
    setSettings(auth.value);
    return auth.value;
  };

  const refreshMemories = async () => {
    try {
      const data = await api<{ memories: DotMemory[] }>('/dots/' + dotId + '/memories');
      setMemories(data.memories);
    } catch { setMemories([]); }
  };

  const refreshEnvironments = async () => {
    setEnvBusy(true);
    try {
      const data = await api<{ environments: Environment[] }>('/environments');
      setEnvironments(data.environments);
    } catch { setEnvironments([]); }
    finally { setEnvBusy(false); }
  };

  useEffect(() => {
    let disposed = false;
    refresh().then(s => { if (!disposed) { setProvider(s.provider); setModel(s.model); } }).catch(e => setError(e.message));
    refreshEnvironments();
    const timer = setInterval(() => { refresh().catch(() => {}); refreshEnvironments().catch(() => {}); }, 5000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (section === 'memory') refreshMemories();
  }, [section, dotId]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current; element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);

  const save = async () => {
    setBusy(true); setError(''); setSaved('');
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify({ provider, model, ...(key ? { api_key: key } : {}) }) });
      setKey(''); await refresh(); setSaved('AI 설정을 저장했습니다.'); onSaved();
    }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const login = async () => {
    setBusy(true); setError('');
    try { await api('/settings/codex/login', post()); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const preference = (patch: Partial<Preferences>) => {
    try { savePreferences({ ...preferences, ...patch }); setSaved('설정을 저장했습니다.'); setError(''); }
    catch { setError('브라우저에 설정을 저장하지 못했습니다.'); }
  };

  const addMemory = async () => {
    const text = memoryDraft.trim();
    if (!text || memoryBusy) return;
    setMemoryBusy(true); setError('');
    try {
      await api('/dots/' + dotId + '/memories', post({ text }));
      setMemoryDraft('');
      await refreshMemories();
      setSaved('기억을 추가했습니다.');
    } catch (e) { setError((e as Error).message); }
    finally { setMemoryBusy(false); }
  };

  const removeMemory = async (memoryId: string) => {
    setMemoryBusy(true); setError('');
    try {
      await api('/dots/' + dotId + '/memories/' + memoryId, { method: 'DELETE' });
      await refreshMemories();
      setSaved('기억을 삭제했습니다.');
    } catch (e) { setError((e as Error).message); }
    finally { setMemoryBusy(false); }
  };

  const changeProvider = (p: AIProvider) => {
    setProvider(p);
    setModel(p === settings?.provider ? settings.model : p === 'openai' ? 'gpt-5.4' : '');
    setSaved('');
  };

  const matches = SECTIONS.filter(s => `${s.label} ${s.group} ${headings[s.id].description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const active = matches.find(s => s.id === section) ?? matches[0];
  const dirty = !!settings && (provider !== settings.provider || model !== settings.model || !!key);
  const aiSection = active?.id === 'accounts' || active?.id === 'agent';

  const groups = [...new Set(matches.map(s => s.group))];

  return (
    <dialog
      ref={dialog}
      className={'settings-workspace' + (navCollapsed ? ' settings-nav-collapsed' : '')}
      aria-label="OhMyDots 설정"
      onCancel={e => { e.preventDefault(); onClose(); }}
      onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); search.current?.focus(); } }}
    >
      <aside className="settings-nav">
        <header className="settings-nav-header">
          <h2>설정</h2>
          <button className="icon-button" aria-label="설정 탐색 접기" onClick={() => setNavCollapsed(true)}><PanelLeftClose size={18} /></button>
        </header>
        <button className="settings-back" onClick={onClose}><ArrowLeft size={18} />대화로 돌아가기</button>
        <label className="settings-search">
          <Search size={16} />
          <input ref={search} aria-label="설정 검색" placeholder="설정 검색" value={query} onChange={e => setQuery(e.target.value)} />
          <kbd>⌘ F</kbd>
          {query && <button className="icon-button" aria-label="검색 초기화" onClick={() => setQuery('')}><X size={14} /></button>}
        </label>
        <nav aria-label="설정 메뉴">
          {groups.map(group => (
            <div className="settings-nav-group" key={group}>
              <small>{group}</small>
              {matches.filter(s => s.group === group).map(s => (
                <button
                  key={s.id}
                  className={active?.id === s.id ? 'active' : undefined}
                  aria-current={active?.id === s.id ? 'page' : undefined}
                  onClick={() => { setSection(s.id); setSaved(''); }}
                >
                  <s.icon size={17} />
                  <span>{s.label}</span>
                  <ChevronRight size={14} className="settings-nav-chevron" />
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="settings-brand"><span />OhMyDots<small>v0.0.1</small></div>
      </aside>

      <main className="settings-main">
        <div className="settings-main-toolbar">
          {navCollapsed && <button className="icon-button" aria-label="설정 탐색 펼치기" onClick={() => setNavCollapsed(false)}><PanelLeftOpen size={20} /></button>}
          <button className="icon-button" aria-label="설정 닫기" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="settings-content">
          {!active ? (
            <div className="settings-empty"><Search size={26} /><h2>일치하는 설정이 없어요</h2><p>검색어를 바꿔 보세요.</p><button className="button" onClick={() => setQuery('')}>검색 초기화</button></div>
          ) : (
            <>
              <header className="settings-page-heading">
                <span>설정 <ChevronRight size={12} /> {active.label}</span>
                <h1>{headings[active.id].title}</h1>
                <p>{headings[active.id].description}</p>
              </header>

              {active.id === 'general' && (
                <Card title="대화와 화면">
                  <Row label="메시지 전송 키" description="Shift + Enter는 항상 줄을 바꿉니다.">
                    <select aria-label="메시지 전송 키" value={preferences.sendWith} onChange={e => preference({ sendWith: e.target.value as Preferences['sendWith'] })}>
                      <option value="enter">Enter</option>
                      <option value="modifier-enter">⌘ / Ctrl + Enter</option>
                    </select>
                  </Row>
                  <Row label="시작 시 컴퓨터 표시" description="다음에 앱을 열 때 컴퓨터 패널을 함께 표시합니다.">
                    <Switch label="시작 시 컴퓨터 표시" checked={preferences.showComputer} onChange={() => preference({ showComputer: !preferences.showComputer })} />
                  </Row>
                  <Row label="애니메이션 줄이기" description="화면 전환과 움직임을 줄입니다.">
                    <Switch label="애니메이션 줄이기" checked={preferences.reduceMotion} onChange={() => preference({ reduceMotion: !preferences.reduceMotion })} />
                  </Row>
                </Card>
              )}

              {active.id === 'general' && (
                <Card title="시작 안내">
                  <Row label="온볼딩 다시 보기" description="dot 소개부터 컴퓨터와 앱 연결까지 다시 살펴 보세요.">
                    <button className="button light" onClick={onOnboarding}>온볼딩 열기</button>
                  </Row>
                </Card>
              )}

              {active.id === 'profile' && (
                <Card>
                  <IdentityEditor profile={profile} onSave={value => { onProfile(value); setSaved('프로필을 저장했습니다.'); }} />
                </Card>
              )}

              {active.id === 'appearance' && (
                <Card title="화면">
                  <Row label="테마" description="대화, 설정, 스페이스에 함께 적용합니다.">
                    <select aria-label="테마" value={profile.theme} onChange={e => onProfile({ ...profile, theme: e.target.value as DotProfile['theme'] })}>
                      <option value="dark">다크</option>
                      <option value="light">라이트</option>
                    </select>
                  </Row>
                  <Row label="애니메이션 줄이기" description="화면 움직임을 줄입니다.">
                    <Switch label="애니메이션 줄이기" checked={preferences.reduceMotion} onChange={() => preference({ reduceMotion: !preferences.reduceMotion })} />
                  </Row>
                </Card>
              )}

              {active.id === 'notifications' && (
                <Card title="브라우저 알림">
                  <Row label="알림 권한" description={notification === 'granted' ? '알림을 표시할 수 있습니다.' : notification === 'denied' ? '브라우저 설정에서 허용할 수 있습니다.' : notification === 'unsupported' ? '이 브라우저는 알림을 지원하지 않습니다.' : '이 브라우저에 알림 권한을 요청합니다.'}>
                    <button className="button light" disabled={notification !== 'default'} onClick={async () => setNotification(await Notification.requestPermission())}>권한 요청</button>
                  </Row>
                  <Row label="작업 완료 알림" description="Dot이 작업을 마치면 알려줍니다.">
                    <Switch label="작업 완료 알림" checked={preferences.runNotifications} onChange={() => preference({ runNotifications: !preferences.runNotifications })} />
                  </Row>
                  <Row label="알림 소리" description="알림이 뜰 때 함께 소리를 냅니다.">
                    <Switch label="알림 소리" checked={preferences.notificationSound} onChange={() => preference({ notificationSound: !preferences.notificationSound })} disabled={!preferences.runNotifications} />
                  </Row>
                  <div className="settings-row">
                    <button className="button light" disabled={notification !== 'granted' || !preferences.runNotifications} onClick={() => new Notification('OhMyDots', { body: '알림이 정상적으로 표시됩니다.' })}>테스트 알림</button>
                  </div>
                </Card>
              )}

              {active.id === 'memory' && (
                <Card title={activeDot ? activeDot.name + '의 기억' : '기억'}>
                  <div className="settings-memory-input">
                    <input
                      aria-label="새 기억"
                      placeholder="예: 보고서는 항상 PDF로 남긴다"
                      value={memoryDraft}
                      disabled={memoryBusy}
                      onChange={e => setMemoryDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void addMemory(); } }}
                    />
                    <button className="button" disabled={memoryBusy || !memoryDraft.trim()} onClick={() => void addMemory()}>{memoryBusy ? <Loader2 size={15} className="spin" /> : '추가'}</button>
                  </div>
                  {memories.length === 0 ? <p className="settings-help">아직 저장된 기억이 없습니다.</p> : (
                    <ul className="settings-memory-list" aria-label="기억 목록">
                      {memories.map(m => (
                        <li key={m.id}>
                          <span>{m.text}</span>
                          <button className="icon-button" aria-label="기억 삭제" disabled={memoryBusy} onClick={() => void removeMemory(m.id)}><Trash2 size={15} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="settings-help">각 Dot마다 별도의 기억이 저장됩니다.</p>
                </Card>
              )}

              {active.id === 'shortcuts' && (
                <Card title="대화">
                  {[['메시지 전송', preferences.sendWith === 'enter' ? 'Enter' : '⌘ / Ctrl + Enter'], ['줄바꿈', 'Shift + Enter'], ['설정 검색', '⌘ / Ctrl + F'], ['설정 닫기', 'Esc']].map(([label, shortcut]) => (
                    <Row key={label} label={label}><kbd>{shortcut}</kbd></Row>
                  ))}
                </Card>
              )}

              {active.id === 'environments' && (
                <Card title="Dot 환경">
                  {envBusy && environments.length === 0 ? <p className="settings-help">불러오는 중…</p> : environments.length === 0 ? <p className="settings-help">등록된 환경이 없습니다.</p> : (
                    <ul className="settings-env-list" aria-label="Dot 환경 목록">
                      {environments.map(env => {
                        const dot = dots.find(d => d.id === env.dot_id);
                        const paused = env.dot_status === 'PAUSED';
                        const archived = env.dot_status === 'ARCHIVED';
                        return (
                          <li key={env.dot_id}>
                            <div className="settings-env-info">
                              <DotAvatar profile={dot || profile} size={32} />
                              <div>
                                <strong>{env.dot_name}</strong>
                                <p>{DOT_STATUS_LABELS[env.dot_status]} · {env.connected ? '온라인' : '오프라인'}{env.width && env.height ? ` · ${env.width}×${env.height}` : ''}</p>
                              </div>
                            </div>
                            <div className="settings-env-actions">
                              {paused ? (
                                <button className="icon-button" aria-label="재개" title="재개" onClick={() => dot && onDotAction(dot, 'resume')}><Play size={16} /></button>
                              ) : (
                                <button className="icon-button" aria-label="일시 중지" title="일시 중지" disabled={archived} onClick={() => dot && onDotAction(dot, 'pause')}><Pause size={16} /></button>
                              )}
                              <button className="icon-button" aria-label="재부팅" title="재부팅" disabled={paused || archived} onClick={() => dot && onDotAction(dot, 'reboot')}><RefreshCw size={16} /></button>
                              <button className="icon-button" aria-label="이름 변경" title="이름 변경" onClick={() => dot && onDotAction(dot, 'rename')}><ArrowUpRight size={16} /></button>
                              <button className="icon-button danger" aria-label="삭제" title="삭제" onClick={() => dot && onDotAction(dot, 'delete')}><Trash2 size={16} /></button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <button className="button light" onClick={() => void refreshEnvironments()}><RefreshCw size={15} /> 새로고침</button>
                </Card>
              )}

              {active.id === 'safety' && (
                <Card title="권한">
                  <Row label="격리 실행" description="모든 작업은 Dot의 격리된 Linux 데스크톱에서 실행됩니다."><span className="settings-badge ok">사용 중</span></Row>
                  <Row label="전송 및 변경 확인" description="메일, 공유, 일정 변경 전 내용과 대상을 확인합니다."><ShieldCheck size={20} /></Row>
                  <Row label="사용자 Mac 접근" description="로컬 기기 파일이나 화면에 직접 접근하는 기능은 아직 제공하지 않습니다."><span className="settings-badge">미지원</span></Row>
                </Card>
              )}

              {active.id === 'accounts' && (
                <Card title="AI 제공자">
                  {(['codex', 'openai'] as const).map(p => (
                    <div className="settings-account" key={p}>
                      <div className="settings-account-info">
                        <div className="settings-account-mark">{p === 'codex' ? <Bot size={21} /> : <KeyRound size={21} />}</div>
                        <div>
                          <strong>{p === 'codex' ? 'Codex' : 'OpenAI API'}</strong>
                          <p>{p === 'codex' ? '이 기기의 ChatGPT 로그인' : '프로젝트 API 키로 연결'}</p>
                        </div>
                      </div>
                      <div className="settings-account-meta">
                        <span className={'settings-badge ' + ((p === 'codex' ? settings?.codex_connected : settings?.openai_configured) ? 'ok' : '')}>
                          {!settings ? '확인 중' : (p === 'codex' ? settings.codex_connected : settings.openai_configured) ? '연결됨' : '연결 필요'}
                        </span>
                        {settings?.provider === p && <span className="settings-badge ok">사용 중</span>}
                      </div>
                      {p === 'codex' && !settings?.codex_connected && (
                        <button className="button" disabled={busy || !settings?.codex_installed || settings?.login.state === 'waiting'} onClick={login}>
                          {settings?.login.state === 'waiting' ? '로그인 기다리는 중…' : 'ChatGPT로 로그인'}
                        </button>
                      )}
                      {p === 'codex' && settings?.login.state === 'waiting' && (
                        <div className="settings-login-hint">
                          <a href={settings.login.url} target="_blank" rel="noreferrer">로그인 화면 열기</a>
                          <p>인증 코드 <strong>{settings.login.code}</strong></p>
                        </div>
                      )}
                      {p === 'openai' && (
                        <label className="settings-field">API 키
                          <input type="password" autoComplete="off" value={key} placeholder={settings?.openai_configured ? '새 키를 입력하면 교첩니다' : 'sk-…'} onChange={e => { setKey(e.target.value); setSaved(''); }} />
                        </label>
                      )}
                      <button className={'settings-select-row ' + (provider === p ? 'selected' : '')} aria-pressed={provider === p} onClick={() => changeProvider(p)}>
                        {provider === p ? <Check size={15} /> : <span className="settings-radio" />}
                        {provider === p ? '기본 제공자로 선택됨' : '기본 제공자로 선택'}
                      </button>
                    </div>
                  ))}
                  <div className="settings-account">
                    <div className="settings-account-info">
                      <div className="settings-account-mark"><Bot size={21} /></div>
                      <div><strong>OpenCode 2</strong><p>OpenCode에 연결된 계정과 모델 사용</p></div>
                    </div>
                    <div className="settings-account-meta">
                      <span className={'settings-badge ' + (settings?.opencode_available ? 'ok' : '')}>{!settings ? '확인 중' : settings.opencode_available ? '사용 가능' : settings.opencode_installed ? '확인 필요' : '설치 필요'}</span>
                      {settings?.provider === 'opencode' && <span className="settings-badge ok">사용 중</span>}
                    </div>
                    <button className={'settings-select-row ' + (provider === 'opencode' ? 'selected' : '')} aria-pressed={provider === 'opencode'} onClick={() => changeProvider('opencode')}>
                      {provider === 'opencode' ? <Check size={15} /> : <span className="settings-radio" />}
                      {provider === 'opencode' ? '기본 제공자로 선택됨' : '기본 제공자로 선택'}
                    </button>
                  </div>
                </Card>
              )}

              {active.id === 'accounts' && (
                <Card title="기본 모델">
                  <ModelPicker provider={provider} configured={!!settings?.openai_configured} value={model} onChange={value => { setModel(value); setSaved(''); }} />
                </Card>
              )}

              {active.id === 'agent' && (
                <Card title="기본 실행 설정">
                  <Row label="AI 제공자">
                    <select value={provider} onChange={e => changeProvider(e.target.value as AIProvider)}>
                      <option value="codex">Codex</option>
                      <option value="openai">OpenAI API</option>
                      <option value="opencode">OpenCode 2</option>
                    </select>
                  </Row>
                  <ModelPicker provider={provider} configured={!!settings?.openai_configured} value={model} onChange={value => { setModel(value); setSaved(''); }} />
                  <p className="settings-help">다음 작업부터 적용됩니다. 실행 중인 작업이 있다면 완료하거나 취소한 뒤 저장해 주세요.</p>
                </Card>
              )}

              {active.id === 'connections' && <Connections dotId={dotId} onOpenComputer={onOpenComputer} onCompose={onCompose} />}
              {active.id === 'skills' && <SkillsCatalog />}

              {active.id === 'usage' && (
                <Card title="누적 토큰">
                  <p className="settings-help">모델이 보고한 값입니다. 계정의 잔여 한도나 청구 금액은 포함하지 않습니다.</p>
                  {usageError ? <p role="alert">사용량을 불러오지 못했습니다. <button className="button" onClick={() => { refresh().catch(e => setError(e.message)); }}>다시 시도</button></p> :
                    !usage ? <p>불러오는 중…</p> :
                    usage.providers.length ? usage.providers.map(row => (
                      <div className="settings-usage" key={row.provider}>
                        <strong>{row.provider === 'codex' ? 'Codex' : row.provider === 'opencode' ? 'OpenCode 2' : 'OpenAI API'}<small>{row.runs.toLocaleString()}개 작업</small></strong>
                        <dl><div><dt>입력</dt><dd>{row.input_tokens.toLocaleString()}</dd></div><div><dt>출력</dt><dd>{row.output_tokens.toLocaleString()}</dd></div><div><dt>캐시</dt><dd>{row.cached_input_tokens.toLocaleString()}</dd></div></dl>
                      </div>
                    )) : <p>첫 작업에서 사용량을 보고하면 여기에 표시됩니다.</p>}
                </Card>
              )}

              {active.id === 'import' && (
                <Card title="문서와 자료">
                  <p className="settings-help">대화에서 생성된 파일은 스페이스에서 확인할 수 있습니다.</p>
                  <button className="button light" onClick={onFiles}><Download size={18} />스페이스 열기</button>
                  <p className="settings-help">외부 파일 업로드와 ChatGPT 대화 기록 가져오기는 아직 지원하지 않습니다.</p>
                </Card>
              )}
            </>
          )}

          {error && <p className="settings-error" role="alert">{error}</p>}
          <footer className="settings-save">
            <span role="status">{saved || (dirty ? '저장하지 않은 AI 설정이 있습니다.' : '')}</span>
            {aiSection && <button className="button" disabled={busy || !settings || !dirty} onClick={save}>{busy ? '저장 중…' : '변경 사항 저장'}</button>}
          </footer>
        </div>
      </main>
    </dialog>
  );
}
