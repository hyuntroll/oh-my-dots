'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Terminal, Folder, Monitor, RotateCcw, Plus, Columns2, PanelsTopLeft, Maximize2, Minimize2, Keyboard, Clipboard, X } from 'lucide-react';
import { api, post, Computer } from '../lib/api';
import Presence from './Presence';
import { RemoteInputQueue } from '../lib/remote-input';

const PREFIX = '/computer-sessions/computer-1';
const special: Record<string, string> = { Enter: 'Return', Backspace: 'BackSpace', Tab: 'Tab', Escape: 'Escape', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'Page_Up', PageDown: 'Page_Down', Control: 'Control_L', Meta: 'Control_L', Shift: 'Shift_L', Alt: 'Alt_L', ' ': 'space' };
export default function ComputerView({ computer, onRefresh, onControlChanged, onError, onClose, onBack, onToggleExpanded, expanded }: { computer: Computer; onRefresh: () => Promise<void>; onControlChanged: (state: Computer) => void; onError: (message: string) => void; onClose: () => void; onBack: () => void; onToggleExpanded: () => void; expanded: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const state = useRef(computer);
  state.current = computer;
  const handoffActive = useRef(false);
  const composition = useRef(false);
  const keys = useRef(new Set<string>());
  const [connection, setConnection] = useState('connecting');
  const [reconnect, setReconnect] = useState(0);
  const [busy, setBusy] = useState(false);
  const [observing, setObserving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const refresh = useCallback(() => { void onRefresh().catch(() => {}); }, [onRefresh]);
  const queue = useMemo(() => new RemoteInputQueue(
    () => state.current,
    (entry, signal) => api(PREFIX + (entry.release ? '/release' : '/input'), { ...post({ ...entry.body, epoch: entry.epoch }), signal }),
    error => { keys.current.clear(); onError((error as Error).message); refresh(); setReconnect(n => n + 1); },
  ), [onError, refresh]);
  useEffect(() => {
    queue.reset(); keys.current.clear();
    if (computer.connected && computer.owner === 'USER' && !computer.handoff) queue.release();
  }, [queue, computer.owner, computer.epoch, computer.handoff, computer.connected]);
  useEffect(() => () => queue.reset(), [queue]);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === panel.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const send = useCallback((body: Record<string, unknown>) => { if (!handoffActive.current) queue.send(body); }, [queue]);
  const release = useCallback(() => {
    keys.current.clear();
    queue.release();
  }, [queue]);
  const reconnectComputer = useCallback(() => {
    queue.reset(); release(); refresh(); setReconnect(n => n + 1);
  }, [queue, release, refresh]);
  useEffect(() => {
    const node = host.current;
    if (!node || !computer.connected) return;
    let disposed = false;
    let closed = false;
    let rfb: import('@novnc/novnc').default | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const retry = () => {
      if (disposed) return;
      queue.reset(); release(); refresh();
      setConnection('disconnected');
      clearTimeout(timer);
      timer = setTimeout(() => setReconnect(n => n + 1), 2500);
    };
    setConnection('connecting');
    timer = setTimeout(() => { rfb?.disconnect(); retry(); }, 10_000);
    import('@novnc/novnc').then(({ default: RFB }) => {
      if (disposed) return;
      rfb = new RFB(node, `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api${PREFIX}/stream`);
      rfb.viewOnly = true;
      rfb.scaleViewport = true;
      rfb.resizeSession = false;
      rfb.background = '#f49a80';
      rfb.addEventListener('connect', () => { if (!disposed) { clearTimeout(timer); setConnection('connected'); } });
      rfb.addEventListener('disconnect', () => {
        closed = true;
        retry();
      });
    }).catch(retry);
    return () => { disposed = true; clearTimeout(timer); if (!closed) rfb?.disconnect(); node.replaceChildren(); };
  }, [computer.connected, reconnect, queue, release, refresh]);
  useEffect(() => {
    window.addEventListener('blur', release);
    const hidden = () => { if (document.hidden) release(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { release(); window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', hidden); };
  }, [release]);
  useEffect(() => {
    const visible = () => { if (!document.hidden) reconnectComputer(); };
    window.addEventListener('online', reconnectComputer);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('online', reconnectComputer); document.removeEventListener('visibilitychange', visible); };
  }, [reconnectComputer]);
  const point = (event: React.PointerEvent<HTMLTextAreaElement> | React.WheelEvent<HTMLTextAreaElement>) => {
    const rect = host.current?.querySelector('canvas')?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
    const width = computer.width || 1280, height = computer.height || 960;
    return { x: Math.min(width - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * width))), y: Math.min(height - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * height))) };
  };
  const keyName = (event: React.KeyboardEvent) => special[event.key] || (event.code.startsWith('Key') ? event.code.slice(3).toLowerCase() : event.key);
  const handoff = async () => {
    if (handoffActive.current) return;
    handoffActive.current = true;
    setBusy(true);
    const returning = computer.owner === 'USER';
    setObserving(returning);
    queue.reset();
    release();
    try {
      const control = await api<Computer>(PREFIX + (returning ? '/return' : '/takeover'), post(), returning ? 115_000 : 10_000);
      onControlChanged({ ...computer, ...control, connected: true });
    }
    catch (error) { onError((error as Error).message); }
    finally { handoffActive.current = false; setBusy(false); setObserving(false); refresh(); }
  };
  const userControls = computer.owner === 'USER' && !computer.handoff && !busy && connection === 'connected';
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await panel.current?.requestFullscreen(); }
    catch { onError('이 브라우저에서는 전체 화면을 사용할 수 없습니다.'); }
  };
  return <section ref={panel} className={'computer-panel ' + (computer.owner === 'USER' ? 'has-user-control' : '')} aria-label="OhMyDots의 컴퓨터">
    <header className="computer-heading"><button className="icon-button mobile-computer-back" aria-label="대화로 돌아가기" onClick={onBack}><X size={18} /></button><div className="computer-tab"><Monitor size={13} /><strong>OhMyDots computer</strong><button className="icon-button close-computer" aria-label="컴퓨터 탭 닫기" onClick={onClose}><X size={12} /></button></div><button className="icon-button computer-plus" aria-label="컴퓨터 도구 열기" title="컴퓨터 도구" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}><Plus size={16} /></button><div className="computer-heading-actions"><span className={'connection ' + (computer.connected && connection === 'connected' ? 'online' : '')} title={!computer.connected ? '오프라인' : connection === 'connected' ? '실시간 연결' : '연결 중'}><i /></span><button className="icon-button" aria-label="컴퓨터 다시 연결" title="컴퓨터 다시 연결" onClick={reconnectComputer}><RotateCcw size={13} /></button><button className="icon-button" aria-label={fullscreen ? '전체 화면 종료' : '컴퓨터 전체 화면'} title="전체 화면" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button><button className="icon-button split-toggle" aria-label={expanded ? '대화와 컴퓨터 분할 보기' : '컴퓨터 넓게 보기'} title="분할 보기 전환" onClick={onToggleExpanded}><Columns2 size={14} /></button></div></header>
    <div className="computer-stage"><div className="computer-display"><div className="desktop-frame" style={{ aspectRatio: `${computer.width || 1280} / ${computer.height || 960}` }}>

      <div className="desktop-surface" ref={host} />
      {userControls && <textarea ref={input} aria-label="원격 컴퓨터 입력" className="desktop-input" autoCapitalize="off" autoComplete="off" spellCheck={false}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => { const p = point(event); if (p) { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); send({ action: 'down', button: event.button === 2 ? 3 : event.button === 1 ? 2 : 1, ...p }); } }}
        onPointerMove={event => { if (event.buttons) { const p = point(event); if (p) send({ action: 'move', ...p }); } }}
        onPointerUp={event => { const p = point(event); if (p) send({ action: 'up', button: event.button === 2 ? 3 : event.button === 1 ? 2 : 1, ...p }); }}
        onLostPointerCapture={release} onBlur={release}
        onWheel={event => { const p = point(event); if (p) send({ action: 'scroll', delta: event.deltaY > 0 ? 2 : -2, ...p }); }}
        onKeyDown={event => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') return;
          if (!special[event.key] && !event.ctrlKey && !event.metaKey && !event.altKey) return;
          if (event.key === ' ' && !event.ctrlKey && !event.metaKey) return;
          event.preventDefault(); const key = keyName(event); keys.current.add(key); send({ action: 'keydown', key });
        }}
        onKeyUp={event => { const key = keyName(event); if (keys.current.delete(key)) { event.preventDefault(); send({ action: 'keyup', key }); } }}
        onCompositionStart={() => { composition.current = true; }}
        onCompositionEnd={event => { composition.current = false; if (event.data) send({ action: 'type', text: event.data }); event.currentTarget.value = ''; }}
        onChange={event => { if (!composition.current && event.currentTarget.value) { send({ action: 'type', text: event.currentTarget.value }); event.currentTarget.value = ''; } }}
        onPaste={event => { event.preventDefault(); send({ action: 'type', text: event.clipboardData.getData('text') }); }} />}
      {(!computer.connected || connection !== 'connected') && <div className="desktop-placeholder"><Monitor size={32} /><strong>{computer.connected ? '컴퓨터에 연결하고 있어요' : '컴퓨터 연결을 기다리고 있어요'}</strong><p>{computer.connected ? '실제 데스크톱 화면이 곧 표시됩니다.' : '연결이 복구되면 화면을 다시 표시합니다.'}</p><button className="button light" onClick={reconnectComputer}><RotateCcw size={14} /> 다시 연결</button></div>}
      {(busy || computer.handoff) && <div className="handoff-overlay"><span className="spinner" />{observing ? '현재 화면을 다시 읽고 있어요' : '제어권을 전환하고 있어요'}</div>}
    </div>
    <div className={'control-bar ' + (computer.owner === 'USER' ? 'user-control' : '')}><strong key={computer.owner} className="control-label">{computer.owner === 'USER' ? 'You have control' : 'OhMyDots has control'}</strong><button className="button" disabled={!computer.connected || busy || computer.handoff} onClick={handoff}>{busy ? '전환 중…' : computer.owner === 'USER' ? 'Return control' : 'Take over'}</button></div></div></div>
    <div className="mobile-computer-tools"><button aria-label="원격 텍스트 입력" disabled={!userControls} onClick={() => setPasteOpen(true)}><Clipboard size={19} /></button><button aria-label="컴퓨터 앱 목록" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}><PanelsTopLeft size={20} /></button><button aria-label="원격 키보드 열기" disabled={!userControls} onClick={() => input.current?.focus({ preventScroll: true })}><Keyboard size={20} /></button></div>
    <Presence show={toolsOpen}><section className="computer-tools" aria-label="컴퓨터 입력 도구"><header><strong>컴퓨터 도구</strong><button className="icon-button" aria-label="컴퓨터 도구 닫기" onClick={() => setToolsOpen(false)}><X size={14} /></button></header>{[[Globe, 'chromium', 'Browser'], [Terminal, 'terminal', 'Terminal'], [Folder, 'files', 'Files']].map(([Icon, app, label]) => { const I = Icon as typeof Globe; return <button key={app as string} aria-label={label as string} disabled={!userControls} onClick={() => { send({ action: 'launch', app }); setToolsOpen(false); }}><I size={16} /><span>{label as string}</span></button>; })}<button aria-label="원격 텍스트 입력" disabled={!userControls} onClick={() => { setPasteOpen(true); setToolsOpen(false); }}><Clipboard size={16} /><span>텍스트 붙여넣기</span></button><button aria-label="원격 키보드 열기" disabled={!userControls} onClick={() => { input.current?.focus({ preventScroll: true }); setToolsOpen(false); }}><Keyboard size={16} /><span>키보드</span></button></section></Presence>
    <Presence show={pasteOpen && userControls}><form className="remote-paste" onSubmit={event => { event.preventDefault(); if (pasteText.trim()) { send({ action: 'type', text: pasteText }); setPasteText(''); setPasteOpen(false); } }}><header><strong>컴퓨터에 텍스트 입력</strong><button type="button" className="icon-button" aria-label="텍스트 입력 닫기" onClick={() => setPasteOpen(false)}><X size={16} /></button></header><textarea aria-label="컴퓨터에 보낼 텍스트" value={pasteText} onChange={event => setPasteText(event.target.value)} maxLength={4000} autoFocus placeholder="보낼 텍스트를 입력하거나 붙여넣으세요" /><button className="button" disabled={!pasteText.trim()}>입력하기</button></form></Presence>
  </section>;
}
