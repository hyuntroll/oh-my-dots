'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Plus, Settings2, MessageSquare, Circle, Folder, X, Check, Loader2, Monitor, History, MoreHorizontal, Activity as ActivityIcon, PanelRightOpen } from 'lucide-react';
import Markdown from 'react-markdown';
import ComputerView from '../components/ComputerView';
import Settings from '../components/Settings';
import RunActivity from '../components/RunActivity';
import Presence from '../components/Presence';
import { api, post, Activity, Computer, Conversation, Run, AuthSettings } from '../lib/api';
import { mergeExecution, tokenCount, type ExecutionState } from '../lib/execution';
const labels: Record<string, string> = { PENDING: '대기 중', RUNNING: '진행 중', WAITING_USER: '응답 대기', COMPLETED: '완료', FAILED: '실패', CANCELLED: '취소됨' };
const emptyComputer: Computer = { connected: false, owner: null, epoch: null, handoff: false };
export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [computer, setComputer] = useState<Computer>(emptyComputer);
  const [execution, setExecution] = useState<ExecutionState>({});
  const followOutput = useRef(true);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [text, setText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [auth, setAuth] = useState<AuthSettings | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [eventOnline, setEventOnline] = useState(false);
  const [artifacts, setArtifacts] = useState<{ path: string; size: number }[]>([]);
  const [preview, setPreview] = useState<{ path: string; text: string } | null>(null);
  const [computerOpen, setComputerOpen] = useState(true);
  const [computerExpanded, setComputerExpanded] = useState(false);
  const [mobileTab, setMobileTab] = useState('chat');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setHistoryOpen(false); setProfileOpen(false); setActivityOpen(false); setPreview(null); } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  const currentId = useRef<string | null>(null);
  const sequence = useRef(0);
  const scroll = useRef<HTMLDivElement>(null);
  const submission = useRef<{ text: string; key: string } | null>(null);
  const refreshing = useRef<Promise<void> | null>(null);
  const controlVersion = useRef(0);
  const controlChanged = useCallback((state: Computer) => { controlVersion.current++; setComputer(state); }, []);
  const refresh = useCallback(() => {
    if (refreshing.current) return refreshing.current;
    const id = currentId.current;
    const version = controlVersion.current;
    const task = (async () => {
      const [list, state, files, row] = await Promise.allSettled([
        api<Conversation[]>('/conversations'),
        api<Computer>('/computer-sessions/computer-1'),
        api<{ path: string; size: number }[]>('/artifacts'),
        id ? api<Conversation>('/conversations/' + id) : Promise.resolve(null),
      ]);
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
  const selectConversation = async (id: string) => { currentId.current = id; localStorage.setItem('dot-conversation', id); const row = await api<Conversation>('/conversations/' + id); if (currentId.current === id) { setConversation(row); setExecution(previous => mergeExecution(previous, row.execution || [])); followOutput.current = true; } };
  const newConversation = async () => { try { const row = await api<Conversation>('/conversations', post()); await selectConversation(row.id); await refresh(); } catch (e) { setError((e as Error).message); } };
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
        if (event.type !== 'message.updated' && event.type !== 'run.usage') setActivity(list => [...list, event].slice(-120));
        if (event.type === 'run.changed' || event.type === 'run.question' || event.type === 'control.changed') void refresh().catch(() => {});
      };
      socket.onclose = () => { if (!cancelled) { setEventOnline(false); reconnect = setTimeout(connectEvents, 2000); } };
    };
    const boot = async () => {
      await api('/session');
      const list = await api<Conversation[]>('/conversations');
      const remembered = localStorage.getItem('dot-conversation');
      const chosen = list.find(c => c.id === remembered) || list[0] || await api<Conversation>('/conversations', post());
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
  const liveText = typeof progress?.message?.payload.text === 'string' ? progress.message.payload.text : '';
  useEffect(() => { if (followOutput.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [liveText]);
  const submit = async () => {
    const prompt = text.trim(); if (!prompt || submitting || !currentId.current) return;
    setSubmitting(true); setError('');
    try {
      if (waitingAnswer) await api('/runs/' + active!.id + '/answer', post({ text: prompt }));
      else {
        if (submission.current?.text !== prompt) submission.current = { text: prompt, key: crypto.randomUUID() };
        await api('/conversations/' + currentId.current + '/messages', post({ text: prompt, idempotency_key: submission.current.key }));
      }
      setText(''); submission.current = null; await refresh();
    } catch (e) { setError((e as Error).message); } finally { setSubmitting(false); }
  };
  const cancel = async (run: Run) => { try { await api('/runs/' + run.id + '/cancel', post()); await refresh(); } catch (e) { setError((e as Error).message); } };
  const relevantActivity = activity.filter(e => !e.run_id || conversation?.runs?.some(r => r.id === e.run_id));
  const ready = auth && (auth.provider === 'codex' ? auth.codex_connected : auth.openai_configured);
  const openFile = (path: string) => api<{ path: string; text: string }>('/artifacts/' + path.split('/').map(encodeURIComponent).join('/')).then(setPreview).catch(e => setError(e.message));
  const openComputer = () => { setComputerOpen(true); setMobileTab('computer'); setProfileOpen(false); };
  return <main className={'app-shell ' + (computerOpen ? '' : 'computer-hidden ') + (computerExpanded ? 'computer-expanded ' : '') + 'tab-' + mobileTab}>
    <section className="chat-panel" aria-label="OhMyDots 대화">
      <header className="chat-heading">
        <button className="profile-trigger" aria-label="OhMyDots 프로필" aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}><img src="/dot-pet.png" alt="" /><span>OhMyDots</span><i className={'status-dot ' + (eventOnline ? '' : 'offline')} /></button>
        <div className="chat-heading-actions"><button className="icon-button" aria-label="새 대화" title="새 대화" onClick={newConversation}><Plus size={15} /></button><button className="icon-button" aria-label="대화 목록" title="대화 목록" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}><History size={15} /></button><button className="icon-button" aria-label="활동 보기" title="활동 보기" aria-expanded={activityOpen} onClick={() => setActivityOpen(!activityOpen)}><MoreHorizontal size={17} /></button><button className="icon-button" aria-label="설정" title="설정" onClick={() => setSettingsOpen(true)}><Settings2 size={15} /></button><button className="icon-button open-computer" aria-label="컴퓨터 열기" title="컴퓨터 열기" onClick={openComputer}><Monitor size={16} /></button></div>
      </header>
      <Presence show={historyOpen}><section className="history-drawer" aria-label="대화 목록"><header><strong>대화</strong><button className="icon-button" aria-label="대화 목록 닫기" onClick={() => setHistoryOpen(false)}><X size={16} /></button></header><button className="new-conversation" onClick={() => { void newConversation(); setHistoryOpen(false); }}><Plus size={15} />새 대화</button><nav>{conversations.map(c => <button aria-current={conversation?.id === c.id ? 'page' : undefined} key={c.id} onClick={() => { selectConversation(c.id).catch(e => setError(e.message)); setHistoryOpen(false); }}><MessageSquare size={14} /><span>{c.title}</span></button>)}</nav></section></Presence>
      <Presence show={profileOpen}><section className="profile-popover" aria-label="OhMyDots 프로필"><img src="/dot-pet.png" alt="OhMyDots 캐릭터" /><h2>OhMyDots</h2><p>{eventOnline ? '온라인' : '연결 중'}</p><span className="profile-section-label">Computers</span><button onClick={openComputer}><Monitor size={17} /><span>OhMyDots computer<small>{computer.connected ? 'Connected' : 'Offline'}</small></span><PanelRightOpen size={16} /></button><button onClick={() => { setSettingsOpen(true); setProfileOpen(false); }}><Settings2 size={17} /><span>설정<small>{auth?.provider === 'openai' ? 'OpenAI API' : 'Codex'}</small></span></button></section></Presence>
      {error && <div className="error-banner" role="alert">{error}<button className="icon-button" aria-label="알림 닫기" onClick={() => setError('')}><X size={15} /></button></div>}
      <div className="messages" ref={scroll} onScroll={() => { const el = scroll.current; if (el) followOutput.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
        {!conversation?.messages?.length ? <div className="welcome"><img src="/dot-pet.png" alt="OhMyDots 캐릭터" /><h1>안녕하세요, OhMyDots예요.</h1><p>메시지를 보내 주세요.<br />함께 생각하고 컴퓨터에서 실행할게요.</p><div className="suggestions">{['현재 화면을 설명해 줘', 'Chromium을 열고 example.com에 들어가 줘', '간단한 메모 파일을 만들어 줘'].map(prompt => <button key={prompt} onClick={() => setText(prompt)}>{prompt}</button>)}</div></div> : conversation.messages.map(message => <Fragment key={conversation.id + ':' + message.sequence}><article className={'message ' + message.role}><div className="message-body"><Markdown>{message.text}</Markdown></div>{message.role === 'user' && message.run_id && (() => { const run = conversation.runs?.find(r => r.id === message.run_id); return run && run.status !== 'COMPLETED' ? <div className={'run-status status-' + run.status}><span>{run.status === 'RUNNING' ? <Loader2 size={11} className="spin" /> : <Circle size={6} fill="currentColor" />}{run.wait_reason === 'CONTROL' ? '제어권 반환 대기' : labels[run.status]}</span>{['RUNNING', 'PENDING', 'WAITING_USER'].includes(run.status) && <button onClick={() => cancel(run)}>취소</button>}{run.error && <small>{run.error}</small>}</div> : null; })()}</article>{message.role === 'user' && message.run_id && conversation.messages?.find(m => m.role === 'user' && m.run_id === message.run_id)?.sequence === message.sequence && (() => {
          const run = conversation.runs?.find(r => r.id === message.run_id);
          return run ? <RunActivity run={run} execution={execution[run.id]} /> : null;
        })()}</Fragment>)}
        {active?.status === 'RUNNING' && liveText && <article className="message assistant streaming-message" aria-label="작성 중인 답변"><div className="message-body"><Markdown>{liveText}</Markdown>{(progress?.message?.sequence ?? 0) > (progress?.activity?.sequence ?? 0) && <span className="stream-cursor" aria-hidden="true" />}</div></article>}
        {conversation?.runs?.length ? (() => { const latest = [...conversation.runs].reverse().find(r => execution[r.id]?.usage); const usage = latest ? execution[latest.id].usage!.payload : null; return usage ? <div className="run-usage" title="이 대화의 최근 작업에서 보고된 토큰 사용량">최근 작업 · 입력 {tokenCount(usage.input_tokens).toLocaleString()} · 출력 {tokenCount(usage.output_tokens).toLocaleString()} 토큰</div> : null; })() : null}
        <Presence show={filesOpen}><section className="chat-files" aria-label="결과 파일 목록"><header><Folder size={14} /><strong>결과 파일</strong><button className="icon-button" aria-label="파일 목록 닫기" onClick={() => setFilesOpen(false)}><X size={14} /></button></header>{artifacts.length ? artifacts.map(file => <button className="file-link" key={file.path} onClick={() => openFile(file.path)}><Folder size={14} /><span>{file.path}</span><small>{file.size} B</small></button>) : <p>아직 생성한 파일이 없습니다.</p>}</section></Presence>
      </div>
      <Presence show={activityOpen}><section className="activity-drawer" aria-label="작업 활동"><header><span><ActivityIcon size={15} />Activity</span><button className="icon-button" aria-label="활동 닫기" onClick={() => setActivityOpen(false)}><X size={15} /></button></header><div className="activity-list">{relevantActivity.length ? relevantActivity.slice(-20).reverse().map(event => <div className="activity-row" key={event.sequence}><i /><div>{event.summary}<time>{new Date(event.created_at * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time></div></div>) : <p>작업을 시작하면 진행 과정이 표시됩니다.</p>}</div></section></Presence>
      <div className="composer-area">{!ready && <button className="configure-hint" onClick={() => setSettingsOpen(true)}>AI 연결 설정 <Settings2 size={12} /></button>}<div className="composer"><button className="composer-plus" aria-label="결과 파일 보기" aria-expanded={filesOpen} onClick={() => setFilesOpen(!filesOpen)}><Plus size={16} /></button><textarea aria-label={waitingAnswer ? 'OhMyDots 질문에 답하기' : 'OhMyDots에게 메시지 보내기'} placeholder={waitingAnswer ? 'OhMyDots의 질문에 답해 주세요' : active ? '추가 메시지 보내기' : '메시지 보내기'} value={text} rows={1} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }} /><button className="send-button" aria-label="메시지 보내기" disabled={!text.trim() || submitting || !conversation || !ready} onClick={submit}>{submitting ? <Loader2 size={14} className="spin" /> : <ArrowUp size={15} />}</button></div></div>
    </section>
    {computerOpen && <ComputerView computer={computer} onRefresh={refresh} onControlChanged={controlChanged} onError={setError} onClose={() => { setComputerOpen(false); setComputerExpanded(false); setMobileTab('chat'); }} onBack={() => { setComputerExpanded(false); setMobileTab('chat'); }} onToggleExpanded={() => setComputerExpanded(!computerExpanded)} expanded={computerExpanded} />}
    <Presence show={settingsOpen}><Settings onClose={() => setSettingsOpen(false)} onSaved={refreshAuth} /></Presence><Presence show={!!preview}>{preview && <div className="modal-backdrop" onClick={() => setPreview(null)}><section role="dialog" aria-modal="true" aria-label="결과 파일" className="artifact-modal" onClick={e => e.stopPropagation()}><header><strong>{preview.path}</strong><button className="icon-button" aria-label="결과 파일 닫기" onClick={() => setPreview(null)}><X size={18} /></button></header><pre>{preview.text}</pre><footer><Check size={14} /> 파일 내용</footer></section></div>}</Presence>
  </main>;
}
