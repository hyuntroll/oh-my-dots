'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Plus, Settings2, MessageSquare, Circle, Folder, X, Loader2, Monitor, SquarePen, PanelRightOpen, ChevronRight } from 'lucide-react';
import Markdown from 'react-markdown';
import ComputerView from '../components/ComputerView';
import Settings from '../components/Settings';
import RunActivity from '../components/RunActivity';
import RunUsage from '../components/RunUsage';
import QuestionCard from '../components/QuestionCard';
import Presence from '../components/Presence';
import DotSidebar, { DotRail } from '../components/DotSidebar';
import Onboarding from '../components/Onboarding';
import CustomizeDot, { DotAvatar } from '../components/DotIdentity';
import DotContext from '../components/DotContext';
import SpacesWorkspace, { type FilePreview } from '../components/SpacesWorkspace';
import { DEFAULT_PROFILE, DOT_COLORS, PROFILE_KEY, parseDotProfile, type DotProfile } from '../lib/dot-profile';
import { readPreferences, shouldSend } from '../lib/preferences';
import { usePreferences } from '../lib/usePreferences';
import { api, ApiError, post, Activity, Computer, Conversation, Run, AuthSettings, Dot } from '../lib/api';
import { mergeExecution, type ExecutionState } from '../lib/execution';
const labels: Record<string, string> = { PENDING: '대기 중', RUNNING: '진행 중', WAITING_USER: '응답 대기', COMPLETED: '완료', FAILED: '실패', CANCELLED: '취소됨' };
const emptyComputer: Computer = { connected: false, owner: null, epoch: null, handoff: false };
export default function Home() {
  const preferences = usePreferences();
  const [profile, setProfile] = useState<DotProfile>(DEFAULT_PROFILE);
  const [dots, setDots] = useState<Dot[]>([]);
  const [activeDotId, setActiveDotId] = useState('dot-1');
  const activeDot = useRef('dot-1');
  const [addingDot, setAddingDot] = useState(false);
  const [creatingDot, setCreatingDot] = useState(false);
  const sessionId = dots.find(dot => dot.id === activeDotId)?.computer_id || 'computer-1';
  const dotQuery = '?dot_id=' + encodeURIComponent(activeDotId);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);
  const [contextSection, setContextSection] = useState<'profile' | 'activity' | 'outputs'>('profile');
  useEffect(() => { try { const saved = parseDotProfile(localStorage.getItem(PROFILE_KEY)); setProfile(saved); setSidebarOpen(window.matchMedia('(min-width: 901px)').matches); } catch {} setContextOpen(window.matchMedia('(min-width: 801px)').matches); setProfileLoaded(true); }, []);
  useEffect(() => { document.documentElement.dataset.theme = profile.theme; }, [profile.theme]);
  const accent = DOT_COLORS.find(color => color.id === profile.color)!.value;
  useEffect(() => { document.documentElement.style.setProperty('--dot-accent', accent); }, [accent]);
  const updateProfile = (value: DotProfile) => {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(value)); setProfile(value);
      const id = activeDot.current;
      void api<Dot>('/dots/' + id, { method: 'PUT', body: JSON.stringify({name: value.name, color: value.color, avatar: value.avatar}) }).then(dot => setDots(previous => previous.map(item => item.id === dot.id ? dot : item))).catch(e => setError(e.message)); }
    catch { setError('설정을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.'); }
  };
  const finishSetup = (value: DotProfile) => { updateProfile({ ...value, setupCompleted: true }); setSidebarOpen(false); setComputerOpen(false); setProfileOpen(false); setSidebarOpen(window.innerWidth > 900); };
  const showContext = (section: 'profile' | 'activity' | 'outputs') => { setContextSection(section); setContextOpen(true); setComputerOpen(false); setComputerExpanded(false); setMobileTab('chat'); setPreview(null); setSpacesOpen(false); ++fileRequest.current; };
  const onboarding = profileLoaded && !profile.setupCompleted;
  useEffect(() => { setComputerOpen(readPreferences().showComputer); }, []);
  useEffect(() => { document.documentElement.dataset.reduceMotion = String(preferences.reduceMotion); }, [preferences.reduceMotion]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [computer, setComputer] = useState<Computer>(emptyComputer);
  const [execution, setExecution] = useState<ExecutionState>({});
  const followOutput = useRef(true);
  const [text, setText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [auth, setAuth] = useState<AuthSettings | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dismissedQuestion, setDismissedQuestion] = useState<string | null>(null);
  const [answeredQuestion, setAnsweredQuestion] = useState<string | null>(null);
  const [eventOnline, setEventOnline] = useState(false);
  const [artifacts, setArtifacts] = useState<{ path: string; size: number }[]>([]);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [spacesOpen, setSpacesOpen] = useState(false);
  const [computerOpen, setComputerOpen] = useState(true);
  const [computerExpanded, setComputerExpanded] = useState(false);
  const [mobileTab, setMobileTab] = useState('chat');
  const [filesOpen, setFilesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSidebarOpen(false); setPreview(null); setSpacesOpen(false); ++fileRequest.current; } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  const currentId = useRef<string | null>(null);
  const sequence = useRef(0);
  const scroll = useRef<HTMLDivElement>(null);
  const submission = useRef<{ text: string; key: string } | null>(null);
  const refreshing = useRef<Promise<void> | null>(null);
  const controlVersion = useRef(0);
  const fileRequest = useRef(0);
  const controlChanged = useCallback((state: Computer) => { controlVersion.current++; setComputer(state); }, []);
  const refresh = useCallback(() => {
    if (refreshing.current) return refreshing.current;
    const id = currentId.current;
    const dotId = activeDot.current;
    const computerId = dotId === "dot-1" ? "computer-1" : "computer-" + dotId;
    const version = controlVersion.current;
    const task = (async () => {
      const [list, state, files, row] = await Promise.allSettled([
        api<Conversation[]>('/conversations?dot_id=' + encodeURIComponent(dotId)),
        api<Computer>('/computer-sessions/' + computerId),
        api<{ path: string; size: number }[]>('/artifacts?dot_id=' + encodeURIComponent(dotId)),
        id ? api<Conversation>('/conversations/' + id) : Promise.resolve(null),
      ]);
      if (activeDot.current !== dotId) return;
      if (list.status === 'fulfilled') setConversations(list.value);
      if (version === controlVersion.current) {
        if (state.status === 'fulfilled') setComputer(state.value);
        else setComputer(previous => ({ ...previous, connected: false }));
      }
      if (files.status === 'fulfilled') setArtifacts(files.value);
      if (row.status === 'fulfilled' && row.value && currentId.current === id) { setConversation(row.value); setExecution(previous => mergeExecution(previous, row.value!.execution || [])); }
      if (list.status === 'rejected') throw list.reason;
    })().finally(() => { refreshing.current = null; });
    refreshing.current = task;
    return task;
  }, []);
  const refreshAuth = useCallback(() => { api<AuthSettings>('/settings').then(setAuth).catch(() => {}); }, []);
  const selectConversation = async (id: string) => { currentId.current = id; localStorage.setItem('dot-conversation:' + activeDot.current, id); const row = await api<Conversation>('/conversations/' + id); if (currentId.current === id) { setConversation(row); setExecution(previous => mergeExecution(previous, row.execution || [])); followOutput.current = true; } };
  const newConversation = async () => { try { const row = await api<Conversation>('/conversations', post({dot_id: activeDot.current})); await selectConversation(row.id); await refresh(); } catch (e) { setError((e as Error).message); } };
  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket;
    let reconnect: ReturnType<typeof setTimeout>;
    let poll: ReturnType<typeof setInterval>;
    let bootRetry: ReturnType<typeof setTimeout>;
    const connectEvents = () => {
      if (cancelled) return;
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/events/ws?after=${sequence.current}`);
      socket.onopen = () => setEventOnline(true);
      socket.onmessage = message => {
        const event = JSON.parse(message.data) as Activity;
        if (event.type === 'heartbeat' || event.sequence <= sequence.current) return;
        sequence.current = event.sequence;
        setExecution(previous => mergeExecution(previous, [event]));
        if (event.type === 'run.changed' || event.type === 'run.question' || event.type === 'control.changed') void refresh().catch(() => {});
      };
      socket.onclose = () => { if (!cancelled) { setEventOnline(false); reconnect = setTimeout(connectEvents, 2000); } };
    };
    const boot = async () => {
      await api('/session');
      let registered = await api<Dot[]>('/dots');
      const legacy = parseDotProfile(localStorage.getItem(PROFILE_KEY));
      if (!registered.find(dot => dot.id === 'dot-1')?.profile_saved) {
        const migrated = await api<Dot>('/dots/dot-1', { method: 'PUT', body: JSON.stringify({name: legacy.name, color: legacy.color, avatar: legacy.avatar}) });
        registered = registered.map(dot => dot.id === migrated.id ? migrated : dot);
      }
      const selected = registered.find(dot => dot.id === localStorage.getItem('active-dot')) || registered[0];
      if (cancelled) return;
      activeDot.current = selected.id; setActiveDotId(selected.id); setDots(registered);
      setProfile({...legacy, name: selected.name, color: selected.color, avatar: selected.avatar});
      const list = await api<Conversation[]>('/conversations?dot_id=' + encodeURIComponent(selected.id));
      const remembered = localStorage.getItem('dot-conversation:' + selected.id) || (selected.id === 'dot-1' ? localStorage.getItem('dot-conversation') : null);
      const chosen = list.find(c => c.id === remembered) || list[0] || await api<Conversation>('/conversations', post({dot_id: activeDot.current}));
      if (cancelled) return;
      await selectConversation(chosen.id);
      await refresh(); setError(''); refreshAuth(); connectEvents();
      poll = setInterval(() => { refresh().catch(() => {}); }, 2000);
    };
    const start = () => { boot().catch(e => { if (!cancelled) { setError('서버에 연결하지 못했습니다. ' + e.message); bootRetry = setTimeout(start, 2500); } }); };
    start();
    return () => { cancelled = true; clearInterval(poll); clearTimeout(reconnect); clearTimeout(bootRetry); socket?.close(); };
  }, [refresh, refreshAuth]);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' }); }, [conversation?.messages?.length, conversation?.runs?.map(r => r.status).join(',')]);
  const active = conversation?.runs?.find(r => r.status === 'RUNNING' || r.status === 'WAITING_USER');
  const waitingAnswer = active?.wait_reason === 'ANSWER';
  const progress = active ? execution[active.id] : undefined;
  const question = waitingAnswer ? progress?.question : undefined;
  const questionKey = question ? active!.id + ":" + question.sequence : null;
  useEffect(() => {
    if (!questionKey) return;
    const frame = requestAnimationFrame(() => {
      if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [questionKey, dismissedQuestion]);
  const liveText = typeof progress?.message?.payload.text === 'string' ? progress.message.payload.text : '';
  useEffect(() => { if (followOutput.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [liveText]);
  const submit = async () => {
    const prompt = text.trim(); if (!prompt || submitting || !currentId.current || (waitingAnswer && (!question || questionKey === answeredQuestion))) return;
    setSubmitting(true); setError('');
    try {
      if (waitingAnswer) {
        await api('/runs/' + active!.id + '/answer', post({ text: prompt, question_id: question?.payload.question_id }));
        setAnsweredQuestion(questionKey);
      }
      else {
        if (submission.current?.text !== prompt) submission.current = { text: prompt, key: crypto.randomUUID() };
        await api('/conversations/' + currentId.current + '/messages', post({ text: prompt, idempotency_key: submission.current.key, dot_name: profile.name }));
      }
      setText(''); submission.current = null; await refresh();
    } catch (e) { setError((e as Error).message); } finally { setSubmitting(false); }
  };
  const cancel = async (run: Run) => { try { await api('/runs/' + run.id + '/cancel', post()); await refresh(); } catch (e) { setError((e as Error).message); } };
  const ready = auth && (auth.provider === 'codex' ? auth.codex_connected : auth.openai_configured);
  const openFile = async (path: string) => {
    const request = ++fileRequest.current;
    setSpacesOpen(true); setComputerOpen(false); setComputerExpanded(false); setMobileTab('chat'); setSidebarOpen(false); setPreview({ path, loading: true });
    if (/\.(png|jpe?g|gif|webp|pdf)$/i.test(path)) { setPreview({ path }); return; }
    try {
      const file = await api<FilePreview>('/artifacts/' + path.split('/').map(encodeURIComponent).join('/') + dotQuery);
      if (fileRequest.current === request) setPreview(file);
    } catch (e) {
      if (fileRequest.current !== request) return;
      setPreview(e instanceof ApiError && [413, 415].includes(e.status) ? { path } : { path, error: (e as Error).message });
    }
  };
  const openSpaces = () => { ++fileRequest.current; setSpacesOpen(true); setComputerOpen(false); setComputerExpanded(false); setMobileTab('chat'); setPreview(null); setSidebarOpen(false); };
  const openComputer = () => { ++fileRequest.current; setSpacesOpen(false); setComputerOpen(true); setMobileTab('computer'); setPreview(null); setSidebarOpen(false); };
  const selectDot = async (id: string, registered = dots) => {
    const selected = registered.find(dot => dot.id === id);
    if (!selected || submitting) return;
    activeDot.current = id; setActiveDotId(id); localStorage.setItem('active-dot', id);
    controlVersion.current++; currentId.current = null; ++fileRequest.current;
    setConversation(null); setConversations([]); setArtifacts([]); setComputer(emptyComputer);
    setPreview(null); setExecution({}); setText(''); submission.current = null;
    setSpacesOpen(false); setContextSection('profile'); setContextOpen(true); setComputerOpen(false);
    setProfile(previous => ({...previous, name: selected.name, color: selected.color, avatar: selected.avatar, setupCompleted: true}));
    try {
      const list = await api<Conversation[]>('/conversations?dot_id=' + encodeURIComponent(id));
      const remembered = localStorage.getItem('dot-conversation:' + id);
      const chosen = list.find(row => row.id === remembered) || list[0] || await api<Conversation>('/conversations', post({dot_id: id}));
      if (activeDot.current !== id) return;
      await selectConversation(chosen.id);
      await refreshing.current;
      await refresh();
    } catch (e) { setError((e as Error).message); }
  };
  const createDot = async (value: DotProfile) => {
    if (creatingDot) return;
    setCreatingDot(true); setError('');
    try {
      const dot = await api<Dot>('/dots', post({name: value.name, color: value.color, avatar: value.avatar}), 120_000);
      const registered = [...dots, dot]; setDots(registered); setAddingDot(false);
      await selectDot(dot.id, registered);
    } catch (e) { setError((e as Error).message); }
    finally { setCreatingDot(false); }
  };
  const composeDraft = (prompt: string) => { ++fileRequest.current; setSettingsOpen(false); setSpacesOpen(false); setPreview(null); setSidebarOpen(false); setMobileTab('chat'); setText(prompt); requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus()); };
  return <div className={'dots-shell ' + (spacesOpen && !computerOpen ? 'spaces-open ' : '') + (sidebarOpen && !spacesOpen ? 'with-sidebar ' : '') + (onboarding ? 'is-onboarding' : '')}>
    <DotRail sidebarOpen={sidebarOpen} onSidebar={() => { if (spacesOpen) { ++fileRequest.current; setSpacesOpen(false); setPreview(null); } setSidebarOpen(!sidebarOpen); }} onHome={() => showContext('profile')} onFiles={openSpaces} onActivity={() => showContext('activity')} onSettings={() => setSettingsOpen(true)} />
    {sidebarOpen && !spacesOpen && <DotSidebar profile={profile} conversations={conversations} currentId={conversation?.id} onSelect={id => { void selectConversation(id).catch(e => setError(e.message)); if (window.innerWidth < 900) setSidebarOpen(false); }} onNew={() => { void newConversation(); if (window.innerWidth < 900) setSidebarOpen(false); }} onHome={() => { showContext('profile'); setSidebarOpen(false); }} onClose={() => setSidebarOpen(false)} dots={dots} activeDotId={activeDotId} onDot={id => { void selectDot(id); }} onAddDot={() => setAddingDot(true)} />}
    {!profileLoaded ? <section className="dot-loading" aria-label="설정 불러오는 중"><DotAvatar profile={profile} size={96} /><p>내 dot을 준비하고 있어요</p></section> : onboarding ? <><Onboarding profile={profile} auth={auth} computer={computer} onChange={updateProfile} onFinish={finishSetup} onSettings={() => setSettingsOpen(true)} />{error && <div className="setup-error" role="alert">{error}</div>}</> : <main className={'app-shell ' + (computerOpen ? '' : 'computer-hidden ') + (computerExpanded ? 'computer-expanded ' : '') + (spacesOpen ? 'has-artifact ' : '') + (!computerOpen && !spacesOpen && contextOpen ? 'has-context ' : '') + 'tab-' + mobileTab}>
    <section className="chat-panel" aria-label="OhMyDots 대화">
      <header className="chat-heading">
        <button className="icon-button new-chat-heading" aria-label="새 대화" title="새 대화" onClick={newConversation}><SquarePen size={20} /></button>
        <button className="profile-trigger" aria-label="Dot 프로필" onClick={() => { showContext('profile'); setContextOpen(!contextOpen || computerOpen); }}><DotAvatar profile={profile} size={37} /><span>{profile.name}</span></button>
        <div className="chat-heading-actions"><button className="icon-button" aria-label="컴퓨터 열기" title="컴퓨터 열기" onClick={openComputer}><Monitor size={20} /></button><button className="icon-button" aria-label="Dot 정보 보기" title="Dot 정보" onClick={() => { showContext('profile'); setContextOpen(!contextOpen || computerOpen); }}><PanelRightOpen size={20} /></button><button className="icon-button" aria-label="Dot 꾸미기" title="Dot 꾸미기" onClick={() => setProfileOpen(true)}><Settings2 size={19} /></button></div>
      </header>
      {error && <div className="error-banner" role="alert">{error}<button className="icon-button" aria-label="알림 닫기" onClick={() => setError('')}><X size={15} /></button></div>}
      <div className="messages" ref={scroll} onScroll={() => { const el = scroll.current; if (el) followOutput.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
        {!conversation?.messages?.length ? <div className="welcome-conversation"><p className="conversation-date">새로운 대화</p><article className="message assistant"><div className="message-body"><p>안녕하세요! 저는 {profile.name}입니다.</p><p>메시지를 보내 주세요. 함께 생각하고, 컴퓨터에서 작업하고, 만든 결과물을 모아 드릴게요.</p></div></article><article className="message assistant"><div className="message-body"><p>어떤 모습으로 함께할까요?</p><button className="customize-inline" onClick={() => setProfileOpen(true)}><DotAvatar profile={profile} size={20} />Customize your dot <ChevronRight size={16} /></button></div></article><div className="suggestions">{['현재 화면을 설명해 줘', '간단한 메모 파일을 만들어 줘'].map(prompt => <button key={prompt} onClick={() => setText(prompt)}>{prompt}</button>)}</div></div> : conversation.messages.map(message => <Fragment key={conversation.id + ':' + message.sequence}><article className={'message ' + message.role}><div className="message-body"><Markdown>{message.text}</Markdown></div>{message.role === 'user' && message.run_id && (() => { const run = conversation.runs?.find(r => r.id === message.run_id); return run && run.status !== 'COMPLETED' ? <div className={'run-status status-' + run.status}><span>{run.status === 'RUNNING' ? <Loader2 size={11} className="spin" /> : <Circle size={6} fill="currentColor" />}{run.wait_reason === 'CONTROL' ? '제어권 반환 대기' : labels[run.status]}</span>{['RUNNING', 'PENDING', 'WAITING_USER'].includes(run.status) && <button onClick={() => cancel(run)}>취소</button>}{run.error && <small>{run.error}</small>}</div> : null; })()}</article>{message.role === 'user' && message.run_id && conversation.messages?.find(m => m.role === 'user' && m.run_id === message.run_id)?.sequence === message.sequence && (() => {
          const run = conversation.runs?.find(r => r.id === message.run_id);
          return run ? <RunActivity run={run} execution={execution[run.id]} /> : null;
        })()}</Fragment>)}
        {active?.status === 'RUNNING' && liveText && <article className="message assistant streaming-message" aria-label="작성 중인 답변"><div className="message-body"><Markdown>{liveText}</Markdown>{(progress?.message?.sequence ?? 0) > (progress?.activity?.sequence ?? 0) && <span className="stream-cursor" aria-hidden="true" />}</div></article>}
        {conversation?.runs?.length ? (() => { const latest = [...conversation.runs].reverse().find(r => execution[r.id]?.usage); const usage = latest ? execution[latest.id].usage!.payload : null; return usage ? <RunUsage usage={usage} /> : null; })() : null}
        <Presence show={filesOpen}><section className="chat-files" aria-label="결과 파일 목록"><header><Folder size={14} /><strong>결과 파일</strong><button className="icon-button" aria-label="파일 목록 닫기" onClick={() => setFilesOpen(false)}><X size={14} /></button></header>{artifacts.length ? artifacts.map(file => <button className="file-link" key={file.path} onClick={() => openFile(file.path)}><Folder size={14} /><span>{file.path}</span><small>{file.size} B</small></button>) : <p>아직 생성한 파일이 없습니다.</p>}</section></Presence>
      </div>
      <div className="composer-area">{question && active && questionKey !== dismissedQuestion && questionKey !== answeredQuestion && <QuestionCard key={questionKey} runId={active.id} question={question} onDismiss={() => setDismissedQuestion(questionKey)} onAnswered={() => { setAnsweredQuestion(questionKey); void refresh().catch(e => setError(e.message)); }} />}{question && questionKey === dismissedQuestion && questionKey !== answeredQuestion && <button className="question-reopen" onClick={() => setDismissedQuestion(null)}><MessageSquare size={14} />질문에 답하기<span>선택지 보기</span></button>}{!ready && <button className="configure-hint" onClick={() => setSettingsOpen(true)}>AI 연결 설정 <Settings2 size={12} /></button>}<div className="composer"><button className="composer-plus" aria-label="결과 파일 보기" aria-expanded={filesOpen} onClick={() => setFilesOpen(!filesOpen)}><Plus size={16} /></button><textarea aria-label={waitingAnswer ? 'OhMyDots 질문에 답하기' : 'OhMyDots에게 메시지 보내기'} placeholder={waitingAnswer ? 'OhMyDots의 질문에 답해 주세요' : active ? '추가 메시지 보내기' : '메시지 보내기'} value={text} rows={1} onChange={e => setText(e.target.value)} onKeyDown={e => { if (shouldSend(e.key, e.shiftKey, e.metaKey || e.ctrlKey, e.nativeEvent.isComposing, preferences.sendWith)) { e.preventDefault(); void submit(); } }} /><button className="send-button" aria-label="메시지 보내기" disabled={!text.trim() || submitting || !conversation || !ready || (waitingAnswer && (!question || questionKey === answeredQuestion))} onClick={submit}>{submitting ? <Loader2 size={14} className="spin" /> : <ArrowUp size={15} />}</button></div></div>
    </section>
    {computerOpen && <ComputerView key={sessionId} sessionId={sessionId} name={profile.name} accent={accent} computer={computer} onRefresh={refresh} onControlChanged={controlChanged} onError={setError} onClose={() => { setComputerOpen(false); setComputerExpanded(false); setMobileTab('chat'); }} onBack={() => { setComputerExpanded(false); setMobileTab('chat'); }} onToggleExpanded={() => setComputerExpanded(!computerExpanded)} expanded={computerExpanded} />}
    {!computerOpen && (spacesOpen ? <SpacesWorkspace key={activeDotId} dotId={activeDotId} preview={preview} files={artifacts} onFile={openFile} onCompose={composeDraft} onBack={() => { ++fileRequest.current; setPreview(null); }} onClose={() => { ++fileRequest.current; setPreview(null); setSpacesOpen(false); }} /> : contextOpen && <DotContext key={activeDotId} sessionId={sessionId} profile={profile} computer={computer} conversation={conversation} execution={execution} artifacts={artifacts} online={eventOnline} section={contextSection} onCustomize={() => setProfileOpen(true)} onComputer={openComputer} onFile={openFile} onSettings={() => setSettingsOpen(true)} onClose={() => setContextOpen(false)} />)}
  </main>}
    <Presence show={settingsOpen}><Settings key={activeDotId} sessionId={sessionId} dotId={activeDotId} onHome={() => { setSettingsOpen(false); showContext('profile'); }} onActivity={() => { setSettingsOpen(false); showContext('activity'); }} profile={profile} onProfile={updateProfile} onFiles={() => { setSettingsOpen(false); openSpaces(); }} onCompose={composeDraft} onClose={() => { setSettingsOpen(false); refreshAuth(); }} onSaved={refreshAuth} onOpenComputer={state => { setSettingsOpen(false); controlChanged(state); openComputer(); }} /></Presence>
    {addingDot && <CustomizeDot title="새 Dot 추가" busy={creatingDot} profile={{...profile, name: 'Dot ' + (dots.length + 1), color: DOT_COLORS[dots.length % DOT_COLORS.length].id, avatar: 'pet', setupCompleted: true}} onSave={value => { void createDot(value); }} onClose={() => { if (!creatingDot) setAddingDot(false); }} />}
    {profileOpen && <CustomizeDot profile={profile} onSave={value => { updateProfile(value); setProfileOpen(false); }} onClose={() => setProfileOpen(false)} />}
  </div>;
}
