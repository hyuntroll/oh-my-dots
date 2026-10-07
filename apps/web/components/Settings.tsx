'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Bot, ChartNoAxesCombined, Check, ChevronRight, CircleCheck, ExternalLink, KeyRound, Blocks, Monitor, Search, SlidersHorizontal } from 'lucide-react';
import { api, post, type AuthSettings, type Computer, type UsageSummary } from '../lib/api';
import { savePreferences, type Preferences } from '../lib/preferences';
import { usePreferences } from '../lib/usePreferences';
import SkillsCatalog from './SkillsCatalog';
import ModelPicker from './ModelPicker';
import Connections from './Connections';
import { DotRail } from './DotSidebar';
import { IdentityEditor } from './DotIdentity';
import { type DotProfile } from '../lib/dot-profile';
import { Bell, Download, Keyboard, Moon, UserRound, ShieldCheck, PawPrint } from 'lucide-react';

const sections = [
  { id: 'general', label: '일반', icon: SlidersHorizontal, group: '개인', description: '전송 Enter 키 애니메이션 모션 시작 화면' },
  { id: 'notifications', label: '알림', icon: Bell, group: '개인', description: '브라우저 알림 권한' },
  { id: 'import', label: '가져오기', icon: Download, group: '개인', description: '파일 자료 가져오기 문서' },
  { id: 'profile', label: '프로필', icon: UserRound, group: '개인', description: '이름 dot 색상 캐릭터' },
  { id: 'appearance', label: '모양', icon: Moon, group: '개인', description: '다크 라이트 테마 애니메이션' },
  { id: 'safety', label: '안전 및 권한', icon: ShieldCheck, group: '개인', description: '읽기 전송 승인 권한' },
  { id: 'pets', label: 'Mini 및 펫', icon: PawPrint, group: '개인', description: '캐릭터 이름 크기 색상' },
  { id: 'shortcuts', label: '키보드 단축키', icon: Keyboard, group: '개인', description: 'Enter 전송 검색 닫기' },
  { id: 'agent', label: '구성', icon: Bot, group: '개인', description: '모델 기본 제공자 실행' },
  { id: 'usage', label: '사용량 및 청구', icon: ChartNoAxesCombined, group: '개인', description: '입력 출력 캐시 토큰 작업' },
  { id: 'accounts', label: '계정', icon: KeyRound, group: '통합', description: 'Codex 로그인 OpenAI API 키 계정 인증' },
  { id: 'connections', label: '플러그인', icon: Blocks, group: '통합', description: '연결 Gmail 이메일 Google Calendar Drive Slack 캘린더 슬랙 앱 plugin' },
  { id: 'skills', label: '스킬', icon: BookOpen, group: '통합', description: '작업 절차 설명서 내장 검증 skills' },
  { id: 'computer', label: '컴퓨터 사용', icon: Monitor, group: '통합', description: '연결 해상도 제어권 원격 데스크톱' },
];
export default function Settings({ sessionId = "computer-1", dotId = "dot-1", onClose, onSaved, onOpenComputer, onCompose, profile, onProfile, onFiles, onHome, onActivity }: { sessionId?: string; dotId?: string; onClose: () => void; onSaved: () => void; onOpenComputer: (state: Computer) => void; onCompose: (prompt: string) => void; profile: DotProfile; onProfile: (profile: DotProfile) => void; onFiles: () => void; onHome: () => void; onActivity: () => void }) {
  const [section, setSection] = useState('general');
  const [query, setQuery] = useState('');
  const [settings, setSettings] = useState<AuthSettings | null>(null);
  const [provider, setProvider] = useState<'codex' | 'openai'>('codex');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usageError, setUsageError] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [computer, setComputer] = useState<Computer | null>(null);
  const [notification, setNotification] = useState<NotificationPermission | 'unsupported'>('default');
  useEffect(() => { setNotification(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission); }, []);
  const [saved, setSaved] = useState('');
  const preferences = usePreferences();
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    const [auth, tokens, desktop] = await Promise.allSettled([api<AuthSettings>('/settings'), api<UsageSummary>('/usage'), api<Computer>('/computer-sessions/' + sessionId)]);
    if (tokens.status === 'fulfilled') { setUsage(tokens.value); setUsageError(false); } else setUsageError(true);
    setComputer(desktop.status === 'fulfilled' ? desktop.value : null);
    if (auth.status === 'rejected') throw auth.reason;
    setSettings(auth.value); return auth.value;
  };
  useEffect(() => {
    let disposed = false;
    refresh().then(s => { if (!disposed) { setProvider(s.provider); setModel(s.model); } }).catch(e => setError(e.message));
    const timer = setInterval(() => { refresh().catch(() => {}); }, 5000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current; element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  const save = async () => {
    setBusy(true); setError(''); setSaved('');
    try { await api('/settings', { method: 'PUT', body: JSON.stringify({ provider, model, ...(key ? { api_key: key } : {}) }) }); setKey(''); await refresh(); setSaved('AI 설정을 저장했습니다.'); onSaved(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const login = async () => { setBusy(true); setError(''); try { await api('/settings/codex/login', post()); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const preference = (patch: Partial<Preferences>) => {
    try { savePreferences({ ...preferences, ...patch }); setSaved('이 브라우저에 저장했습니다.'); setError(''); }
    catch { setError('브라우저에 설정을 저장하지 못했습니다. 저장 공간 접근을 확인해 주세요.'); }
  };
  const changeProvider = (p: 'codex' | 'openai') => { setProvider(p); setModel(p === settings?.provider ? settings.model : p === 'codex' ? '' : 'gpt-5.4'); setSaved(''); };
  const matches = sections.filter(s => `${s.label} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const active = matches.find(s => s.id === section) ?? matches[0];
  const dirty = !!settings && (provider !== settings.provider || model !== settings.model || !!key);
  const aiSection = active?.id === 'accounts' || active?.id === 'agent';
  return <dialog ref={dialog} className="settings-workspace" aria-label="OhMyDots 설정" onCancel={e => { e.preventDefault(); onClose(); }} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); search.current?.focus(); } }}>
    <DotRail sidebarOpen={false} onSidebar={onClose} onHome={onHome} onFiles={onFiles} onActivity={onActivity} onSettings={() => setSection('general')} />
    <aside className="settings-sidebar"><h2 className="settings-sidebar-title">설정</h2>
      <button className="settings-back" onClick={onClose}><ArrowLeft size={18} />대화로 돌아가기</button>
      <label className="settings-search"><Search size={16} /><input ref={search} aria-label="설정 검색" placeholder="설정 검색" value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ F</kbd></label>
      <nav aria-label="설정 메뉴">{['개인', '통합'].map(group => <div className="settings-nav-group" key={group}>{matches.some(s => s.group === group) && <small>{group}</small>}{matches.filter(s => s.group === group).map(s => <button key={s.id} aria-current={active?.id === s.id ? 'page' : undefined} onClick={() => { setSection(s.id); setSaved(''); }}><s.icon size={17} />{s.label}</button>)}</div>)}</nav>
      <div className="settings-brand"><img src="/dot-pet.png" alt="" /><span>OhMyDots<small>v0.0.1 · 나의 컴퓨터 에이전트</small></span></div>
    </aside>
    <main className="settings-main"><div className="settings-content">
      {!active ? <div className="settings-empty"><Search size={26} /><h2>일치하는 설정이 없어요</h2><p>모델, 사용량, 전송 키 등으로 검색해 보세요.</p><button className="button" onClick={() => setQuery('')}>검색 초기화</button></div> : <>
        <header className="settings-page-heading"><span>설정 <ChevronRight size={12} /> {active.label}</span><h1>{active.label}</h1><p>{({ accounts: 'AI 계정을 연결하고 사용할 모델을 선택하세요.', agent: '작업에 사용할 기본 AI와 모델을 설정하세요.', skills: '필요한 작업 절차를 찾아보고 내용을 확인하세요.', usage: '작업에서 보고된 사용량을 확인하세요.', connections: '플러그인, 앱, MCP 연결을 관리하세요.', general: '권한과 대화 동작을 나에게 맞게 조정하세요.', appearance: '화면의 테마와 움직임을 설정하세요.', profile: 'dot의 이름과 모습을 설정하세요.', pets: '함께할 캐릭터와 색상을 선택하세요.', notifications: '이 브라우저의 알림 권한을 확인하세요.', import: '문서와 자료를 모아 보고 작업을 이어가세요.', shortcuts: '대화와 설정에서 사용하는 단축키입니다.', safety: '실행 환경과 연결된 앱의 권한을 확인하세요.', computer: '컴퓨터의 연결과 제어 상태를 확인하세요.' } as Record<string, string>)[active.id]}</p></header>
        {active.id === 'accounts' && <div className="settings-cards">{(['codex', 'openai'] as const).map(p => <section className="settings-card" key={p}>
          <header><div className="provider-mark">{p === 'codex' ? <Bot size={21} /> : <KeyRound size={21} />}</div><div><h2>{p === 'codex' ? 'Codex' : 'OpenAI API'}</h2><p>{p === 'codex' ? '이 기기의 ChatGPT 로그인' : '프로젝트 API 키로 연결'}</p></div><span className={'settings-badge ' + ((p === 'codex' ? settings?.codex_connected : settings?.openai_configured) ? 'connected' : '')}>{!settings ? '확인 중' : (p === 'codex' ? settings.codex_connected : settings.openai_configured) ? '연결됨' : '연결 필요'}</span></header>
          <div className="settings-account-row"><div><strong>{p === 'codex' ? '시스템 기본 계정' : '프로젝트 API 키'}</strong><p>{p === 'codex' ? settings?.codex_installed === false ? '서버에 Codex CLI를 설치해야 연결할 수 있습니다.' : '현재 서버의 Codex 로그인을 사용합니다.' : '키는 서버에 보관하며 저장 후 다시 표시하지 않습니다.'}</p></div>{settings?.provider === p && <span className="settings-badge">사용 중</span>}</div>
          {p === 'codex' && !settings?.codex_connected && <button className="button" disabled={busy || !settings?.codex_installed || settings?.login.state === 'waiting'} onClick={login}>{settings?.login.state === 'waiting' ? '로그인 기다리는 중…' : 'ChatGPT로 로그인'}</button>}
          {p === 'codex' && settings?.login.state === 'waiting' && <div className="device-login"><a href={settings.login.url} target="_blank" rel="noreferrer">로그인 화면 열기 <ExternalLink size={14} /></a><p>인증 코드 <strong>{settings.login.code}</strong></p></div>}
          {p === 'codex' && settings?.login.state === 'failed' && <p className="error">로그인에 실패했습니다. 다시 시도해 주세요.</p>}
          {p === 'openai' && <label className="settings-field">API 키<input type="password" autoComplete="off" value={key} placeholder={settings?.openai_configured ? '새 키를 입력하면 교체됩니다' : 'sk-…'} onChange={e => { setKey(e.target.value); setSaved(''); }} /></label>}
          <button className={'provider-select ' + (provider === p ? 'selected' : '')} aria-pressed={provider === p} onClick={() => changeProvider(p)}>{provider === p ? <Check size={15} /> : <span className="provider-radio" />}{provider === p ? '기본 제공자로 선택됨' : '기본 제공자로 선택'}</button>
        </section>)}</div>}
        {active.id === 'accounts' && <section className="settings-card"><h2>기본 모델</h2><ModelPicker provider={provider} configured={!!settings?.openai_configured} value={model} onChange={value => { setModel(value); setSaved(''); }} /></section>}
        {active.id === 'connections' && <Connections dotId={dotId} onOpenComputer={onOpenComputer} onCompose={onCompose} />}
        {active.id === 'agent' && <section className="settings-card"><h2>기본 실행 설정</h2><label className="settings-field">AI 제공자<select value={provider} onChange={e => changeProvider(e.target.value as 'codex' | 'openai')}><option value="codex">Codex</option><option value="openai">OpenAI API</option></select></label><ModelPicker provider={provider} configured={!!settings?.openai_configured} value={model} onChange={value => { setModel(value); setSaved(''); }} /><p className="settings-help">다음 작업부터 적용됩니다. 실행 중인 작업이 있다면 완료하거나 취소한 뒤 저장해 주세요.</p><div className="settings-rule"><CircleCheck size={17} /><span>한 번에 한 작업씩 실행하며 추가 요청은 순서대로 이어갑니다.</span></div></section>}
        {active.id === 'skills' && <SkillsCatalog />}
        {['profile', 'pets'].includes(active.id) && <section className="settings-card"><IdentityEditor profile={profile} onSave={value => { onProfile(value); setSaved('이름과 모습을 저장했습니다.'); }} /></section>}
        {active.id === 'appearance' && <section className="settings-card"><div className="preference-row"><div><strong>테마</strong><p>대화, 설정, 스페이스에 함께 적용합니다.</p></div><select aria-label="화면 테마" value={profile.theme} onChange={e => onProfile({ ...profile, theme: e.target.value as DotProfile['theme'] })}><option value="dark">다크</option><option value="light">라이트</option></select></div><div className="preference-row"><div><strong>애니메이션 줄이기</strong><p>화면 움직임을 줄입니다.</p></div><button className="preference-switch" role="switch" aria-label="애니메이션 줄이기" aria-checked={preferences.reduceMotion} onClick={() => preference({ reduceMotion: !preferences.reduceMotion })}><span /></button></div></section>}
        {active.id === 'notifications' && <section className="settings-card"><h2>브라우저 알림</h2><div className="preference-row"><div><strong>알림 권한</strong><p>{notification === 'granted' ? '알림을 표시할 수 있습니다.' : notification === 'denied' ? '브라우저의 사이트 설정에서 허용할 수 있습니다.' : notification === 'unsupported' ? '이 브라우저는 알림을 지원하지 않습니다.' : '이 브라우저에 알림 권한을 요청합니다.'}</p></div><button className="button" disabled={notification !== 'default'} onClick={async () => { setNotification(await Notification.requestPermission()); }}>권한 요청</button></div><button className="button" disabled={notification !== 'granted'} onClick={() => new Notification('OhMyDots', { body: '알림이 정상적으로 표시됩니다.' })}>테스트 알림</button><p className="settings-help">현재는 알림 권한 확인과 테스트를 지원합니다. 작업 완료 자동 알림은 아직 제공하지 않습니다.</p></section>}
        {active.id === 'import' && <section className="settings-card"><h2>문서와 자료</h2><p>대화에서 생성된 파일을 스페이스에서 검색하고 열거나 다운로드할 수 있습니다.</p><button className="button" onClick={onFiles}><Download size={18} />스페이스 열기</button><p className="settings-help">외부 파일 업로드와 ChatGPT 대화 기록 가져오기는 아직 지원하지 않습니다.</p></section>}
        {active.id === 'safety' && <section className="settings-card"><h2>권한</h2><div className="preference-row"><div><strong>기본 권한</strong><p>격리된 컴퓨터와 작업 폴더에서 실행합니다. 연결된 앱의 API는 읽기 전용입니다.</p></div><span className="settings-badge connected">사용 중</span></div><div className="preference-row"><div><strong>전송 및 변경</strong><p>메일 전송, 공유, 일정 수정은 내용과 대상을 제시하고 확인을 받은 뒤 브라우저에서 실행합니다.</p></div><ShieldCheck size={22} /></div><div className="preference-row"><div><strong>사용자 컴퓨터 접근</strong><p>사용자의 Mac 파일이나 화면에 접근하는 로컬 연결은 현재 지원하지 않습니다.</p></div><span className="settings-badge">연결되지 않음</span></div></section>}
        {active.id === 'shortcuts' && <section className="settings-card"><h2>대화</h2>{[['메시지 전송', preferences.sendWith === 'enter' ? 'Enter' : '⌘ / Ctrl + Enter'], ['줄바꿈', 'Shift + Enter'], ['설정 검색', '⌘ / Ctrl + F'], ['설정 닫기', 'Esc']].map(([label, shortcut]) => <div className="preference-row" key={label}><strong>{label}</strong><kbd>{shortcut}</kbd></div>)}</section>}
        {active.id === 'general' && <><h2 className="settings-section-title">권한</h2><section className="settings-card"><div className="preference-row"><div><strong>기본 권한</strong><p>dot의 격리된 컴퓨터에서 파일과 앱을 사용합니다. 연결한 서비스는 허용된 API 기능을 우선 사용합니다.</p></div><span className="settings-badge connected">사용 중</span></div><div className="preference-row"><div><strong>전송과 변경 확인</strong><p>메일 전송, 공유, 일정 변경 전에는 내용과 대상을 확인합니다.</p></div><button className="button" onClick={() => setSection('safety')}>권한 보기</button></div></section><h2 className="settings-section-title">일반</h2></>}
        {active.id === 'general' && <section className="settings-card"><h2>대화와 화면</h2><div className="preference-row"><div><strong>메시지 전송 키</strong><p>Shift + Enter는 항상 줄을 바꿉니다.</p></div><select aria-label="메시지 전송 키" value={preferences.sendWith} onChange={e => preference({ sendWith: e.target.value as Preferences['sendWith'] })}><option value="enter">Enter</option><option value="modifier-enter">⌘ / Ctrl + Enter</option></select></div>{([{ field: 'showComputer', label: '시작 시 컴퓨터 표시', description: '다음에 앱을 열 때 컴퓨터 패널을 함께 표시합니다.' }, { field: 'reduceMotion', label: '애니메이션 줄이기', description: '대화 화면의 전환과 움직임을 줄입니다.' }] as const).map(row => <div className="preference-row" key={row.field}><div><strong>{row.label}</strong><p>{row.description}</p></div><button className="preference-switch" role="switch" aria-label={row.label} aria-checked={preferences[row.field]} onClick={() => preference({ [row.field]: !preferences[row.field] })}><span /></button></div>)}<p className="settings-help">이 설정은 현재 브라우저에 자동으로 저장됩니다.</p></section>}
        {active.id === 'computer' && <section className="settings-card"><header><Monitor size={22} /><h2>OhMyDots computer</h2><span className={'settings-badge ' + (computer?.connected ? 'connected' : '')}>{computer ? computer.connected ? '연결됨' : '연결 끊김' : '상태 확인 불가'}</span></header><dl className="computer-facts"><div><dt>현재 제어</dt><dd>{computer?.owner === 'USER' ? '사용자' : computer?.owner === 'AGENT' ? 'OhMyDots' : '확인 중'}</dd></div><div><dt>화면 해상도</dt><dd>{computer?.width && computer?.height ? `${computer.width} × ${computer.height}` : '확인 중'}</dd></div><div><dt>실행 환경</dt><dd>격리된 Linux 데스크톱</dd></div></dl><p className="settings-help">컴퓨터 화면의 Take over로 직접 조작하고 Return control로 돌려줄 수 있습니다. 작업 취소는 대화에서 별도로 할 수 있습니다.</p><button className="button" onClick={() => { refresh().catch(e => setError(e.message)); }}>상태 새로고침</button></section>}
        {active.id === 'usage' && <section className="settings-card"><h2>누적 토큰</h2><p className="settings-help">모델이 보고한 값입니다. 계정의 잔여 한도나 청구 금액은 포함하지 않습니다.</p>{usageError ? <p role="alert">사용량을 불러오지 못했습니다. <button className="button" onClick={() => { refresh().catch(e => setError(e.message)); }}>다시 시도</button></p> : !usage ? <p>사용량을 불러오는 중…</p> : usage.providers.length ? usage.providers.map(row => <div className="usage-provider" key={row.provider}><strong>{row.provider === 'codex' ? 'Codex' : 'OpenAI API'}<small>{row.runs.toLocaleString()}개 작업</small></strong><dl><div><dt>입력 토큰</dt><dd>{row.input_tokens.toLocaleString()}</dd></div><div><dt>출력 토큰</dt><dd>{row.output_tokens.toLocaleString()}</dd></div><div><dt>입력 중 캐시</dt><dd>{row.cached_input_tokens.toLocaleString()}</dd></div></dl></div>) : <p>첫 작업에서 사용량을 보고하면 여기에 표시됩니다.</p>}</section>}
      </>}
      {error && <p className="settings-error" role="alert">{error}</p>}
      <footer className="settings-save"><span role="status">{saved || (dirty ? '저장하지 않은 AI 설정이 있습니다.' : '')}</span>{aiSection && <button className="button" disabled={busy || !settings || !dirty} onClick={save}>{busy ? '저장 중…' : '변경 사항 저장'}</button>}</footer>
    </div></main>
  </dialog>;
}
