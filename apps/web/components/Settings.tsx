'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Bot, ChartNoAxesCombined, Check, ChevronRight, CircleCheck, ExternalLink, KeyRound, Monitor, Search, SlidersHorizontal } from 'lucide-react';
import { api, post, type AuthSettings, type Computer, type UsageSummary } from '../lib/api';
import { savePreferences, type Preferences } from '../lib/preferences';
import { usePreferences } from '../lib/usePreferences';
import SkillsCatalog from './SkillsCatalog';

const sections = [
  { id: 'accounts', label: 'AI 연결', icon: KeyRound, group: 'AI', description: 'Codex 로그인 OpenAI API 키 계정 인증' },
  { id: 'agent', label: '에이전트', icon: Bot, group: 'AI', description: '모델 기본 제공자 실행' },
  { id: 'skills', label: '스킬', icon: BookOpen, group: 'AI', description: '작업 절차 설명서 내장 검증 skills' },
  { id: 'usage', label: '사용량', icon: ChartNoAxesCombined, group: 'AI', description: '입력 출력 캐시 토큰 작업' },
  { id: 'general', label: '일반', icon: SlidersHorizontal, group: '환경', description: '전송 Enter 키 애니메이션 모션 시작 화면' },
  { id: 'computer', label: '컴퓨터', icon: Monitor, group: '환경', description: '연결 해상도 제어권 원격 데스크톱' },
];
export default function Settings({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [section, setSection] = useState('accounts');
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
  const [saved, setSaved] = useState('');
  const preferences = usePreferences();
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    const [auth, tokens, desktop] = await Promise.allSettled([api<AuthSettings>('/settings'), api<UsageSummary>('/usage'), api<Computer>('/computer-sessions/computer-1')]);
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
    <aside className="settings-sidebar">
      <button className="settings-back" onClick={onClose}><ArrowLeft size={18} />대화로 돌아가기</button>
      <label className="settings-search"><Search size={16} /><input ref={search} aria-label="설정 검색" placeholder="설정 검색" value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ F</kbd></label>
      <nav aria-label="설정 메뉴">{['AI', '환경'].map(group => <div className="settings-nav-group" key={group}>{matches.some(s => s.group === group) && <small>{group === 'AI' ? 'AI 기능' : '작업 환경'}</small>}{matches.filter(s => s.group === group).map(s => <button key={s.id} aria-current={active?.id === s.id ? 'page' : undefined} onClick={() => { setSection(s.id); setSaved(''); }}><s.icon size={17} />{s.label}</button>)}</div>)}</nav>
      <div className="settings-brand"><img src="/dot-pet.png" alt="" /><span>OhMyDots<small>v0.0.1 · 나의 컴퓨터 에이전트</small></span></div>
    </aside>
    <main className="settings-main"><div className="settings-content">
      {!active ? <div className="settings-empty"><Search size={26} /><h2>일치하는 설정이 없어요</h2><p>모델, 사용량, 전송 키 등으로 검색해 보세요.</p><button className="button" onClick={() => setQuery('')}>검색 초기화</button></div> : <>
        <header className="settings-page-heading"><span>설정 <ChevronRight size={12} /> {active.label}</span><h1>{active.label}</h1><p>{active.id === 'accounts' ? 'OhMyDots가 사용할 AI를 연결하고 기본 제공자를 선택하세요.' : active.id === 'agent' ? '작업에 사용할 기본 AI와 모델을 설정하세요.' : active.id === 'skills' ? 'OhMyDots가 참고하는 작업 절차를 살펴보세요.' : active.id === 'usage' ? 'OhMyDots 작업에서 보고된 토큰 사용량을 확인하세요.' : active.id === 'general' ? '대화와 화면의 동작을 나에게 맞게 조정하세요.' : '내 컴퓨터의 연결과 제어 상태를 확인하세요.'}</p></header>
        {active.id === 'accounts' && <div className="settings-cards">{(['codex', 'openai'] as const).map(p => <section className="settings-card" key={p}>
          <header><div className="provider-mark">{p === 'codex' ? <Bot size={21} /> : <KeyRound size={21} />}</div><div><h2>{p === 'codex' ? 'Codex' : 'OpenAI API'}</h2><p>{p === 'codex' ? '이 기기의 ChatGPT 로그인' : '프로젝트 API 키로 연결'}</p></div><span className={'settings-badge ' + ((p === 'codex' ? settings?.codex_connected : settings?.openai_configured) ? 'connected' : '')}>{!settings ? '확인 중' : (p === 'codex' ? settings.codex_connected : settings.openai_configured) ? '연결됨' : '연결 필요'}</span></header>
          <div className="settings-account-row"><div><strong>{p === 'codex' ? '시스템 기본 계정' : '프로젝트 API 키'}</strong><p>{p === 'codex' ? settings?.codex_installed === false ? '서버에 Codex CLI를 설치해야 연결할 수 있습니다.' : '현재 서버의 Codex 로그인을 사용합니다.' : '키는 서버에 보관하며 저장 후 다시 표시하지 않습니다.'}</p></div>{settings?.provider === p && <span className="settings-badge">사용 중</span>}</div>
          {p === 'codex' && !settings?.codex_connected && <button className="button" disabled={busy || !settings?.codex_installed || settings?.login.state === 'waiting'} onClick={login}>{settings?.login.state === 'waiting' ? '로그인 기다리는 중…' : 'ChatGPT로 로그인'}</button>}
          {p === 'codex' && settings?.login.state === 'waiting' && <div className="device-login"><a href={settings.login.url} target="_blank" rel="noreferrer">로그인 화면 열기 <ExternalLink size={14} /></a><p>인증 코드 <strong>{settings.login.code}</strong></p></div>}
          {p === 'codex' && settings?.login.state === 'failed' && <p className="error">로그인에 실패했습니다. 다시 시도해 주세요.</p>}
          {p === 'openai' && <label className="settings-field">API 키<input type="password" autoComplete="off" value={key} placeholder={settings?.openai_configured ? '새 키를 입력하면 교체됩니다' : 'sk-…'} onChange={e => { setKey(e.target.value); setSaved(''); }} /></label>}
          <button className={'provider-select ' + (provider === p ? 'selected' : '')} aria-pressed={provider === p} onClick={() => changeProvider(p)}>{provider === p ? <Check size={15} /> : <span className="provider-radio" />}{provider === p ? '기본 제공자로 선택됨' : '기본 제공자로 선택'}</button>
        </section>)}</div>}
        {active.id === 'agent' && <section className="settings-card"><h2>기본 실행 설정</h2><label className="settings-field">AI 제공자<select value={provider} onChange={e => changeProvider(e.target.value as 'codex' | 'openai')}><option value="codex">Codex</option><option value="openai">OpenAI API</option></select></label><label className="settings-field">모델<input value={model} placeholder={provider === 'codex' ? '비워두면 계정 기본 모델' : 'gpt-5.4'} onChange={e => { setModel(e.target.value); setSaved(''); }} /></label><p className="settings-help">다음 작업부터 적용됩니다. 실행 중인 작업이 있다면 완료하거나 취소한 뒤 저장해 주세요.</p><div className="settings-rule"><CircleCheck size={17} /><span>한 번에 한 작업씩 실행하며 추가 요청은 순서대로 이어갑니다.</span></div></section>}
        {active.id === 'skills' && <SkillsCatalog />}
        {active.id === 'general' && <section className="settings-card"><h2>대화와 화면</h2><div className="preference-row"><div><strong>메시지 전송 키</strong><p>Shift + Enter는 항상 줄을 바꿉니다.</p></div><select aria-label="메시지 전송 키" value={preferences.sendWith} onChange={e => preference({ sendWith: e.target.value as Preferences['sendWith'] })}><option value="enter">Enter</option><option value="modifier-enter">⌘ / Ctrl + Enter</option></select></div>{([{ field: 'showComputer', label: '시작 시 컴퓨터 표시', description: '다음에 앱을 열 때 컴퓨터 패널을 함께 표시합니다.' }, { field: 'reduceMotion', label: '애니메이션 줄이기', description: '대화 화면의 전환과 움직임을 줄입니다.' }] as const).map(row => <div className="preference-row" key={row.field}><div><strong>{row.label}</strong><p>{row.description}</p></div><button className="preference-switch" role="switch" aria-label={row.label} aria-checked={preferences[row.field]} onClick={() => preference({ [row.field]: !preferences[row.field] })}><span /></button></div>)}<p className="settings-help">이 설정은 현재 브라우저에 자동으로 저장됩니다.</p></section>}
        {active.id === 'computer' && <section className="settings-card"><header><Monitor size={22} /><h2>OhMyDots computer</h2><span className={'settings-badge ' + (computer?.connected ? 'connected' : '')}>{computer ? computer.connected ? '연결됨' : '연결 끊김' : '상태 확인 불가'}</span></header><dl className="computer-facts"><div><dt>현재 제어</dt><dd>{computer?.owner === 'USER' ? '사용자' : computer?.owner === 'AGENT' ? 'OhMyDots' : '확인 중'}</dd></div><div><dt>화면 해상도</dt><dd>{computer?.width && computer?.height ? `${computer.width} × ${computer.height}` : '확인 중'}</dd></div><div><dt>실행 환경</dt><dd>격리된 Linux 데스크톱</dd></div></dl><p className="settings-help">컴퓨터 화면의 Take over로 직접 조작하고 Return control로 돌려줄 수 있습니다. 작업 취소는 대화에서 별도로 할 수 있습니다.</p><button className="button" onClick={() => { refresh().catch(e => setError(e.message)); }}>상태 새로고침</button></section>}
        {active.id === 'usage' && <section className="settings-card"><h2>누적 토큰</h2><p className="settings-help">모델이 보고한 값입니다. 계정의 잔여 한도나 청구 금액은 포함하지 않습니다.</p>{usageError ? <p role="alert">사용량을 불러오지 못했습니다. <button className="button" onClick={() => { refresh().catch(e => setError(e.message)); }}>다시 시도</button></p> : !usage ? <p>사용량을 불러오는 중…</p> : usage.providers.length ? usage.providers.map(row => <div className="usage-provider" key={row.provider}><strong>{row.provider === 'codex' ? 'Codex' : 'OpenAI API'}<small>{row.runs.toLocaleString()}개 작업</small></strong><dl><div><dt>입력 토큰</dt><dd>{row.input_tokens.toLocaleString()}</dd></div><div><dt>출력 토큰</dt><dd>{row.output_tokens.toLocaleString()}</dd></div><div><dt>입력 중 캐시</dt><dd>{row.cached_input_tokens.toLocaleString()}</dd></div></dl></div>) : <p>첫 작업에서 사용량을 보고하면 여기에 표시됩니다.</p>}</section>}
      </>}
      {error && <p className="settings-error" role="alert">{error}</p>}
      <footer className="settings-save"><span role="status">{saved || (dirty ? '저장하지 않은 AI 설정이 있습니다.' : '')}</span>{aiSection && <button className="button" disabled={busy || !settings || !dirty} onClick={save}>{busy ? '저장 중…' : '변경 사항 저장'}</button>}</footer>
    </div></main>
  </dialog>;
}
