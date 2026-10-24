'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Circle, FileText, Loader2, Maximize2, Monitor, MoreHorizontal, Pencil, Phone, PictureInPicture2, Settings2, X } from 'lucide-react';
import Markdown from 'react-markdown';
import ComputerThumbnail from './ComputerThumbnail';
import { DotAvatar } from './DotIdentity';
import RunActivity from './RunActivity';
import { dotActivity } from '../lib/dot-motion';
import { CALL_UNAVAILABLE, dotStatusLabel, relativeTime, type DotStatus } from '../lib/dot-lifecycle';
import type { DotProfile } from '../lib/dot-profile';
import type { Computer, Conversation, DotActivityRow } from '../lib/api';
import type { ExecutionState } from '../lib/execution';

type File = { path: string; size: number };
type Section = 'profile' | 'activity' | 'outputs';
type DotSummary = { name: string; status: DotStatus; pinned: boolean; last_active_at: number | null };

const RUN_LABELS: Record<string, string> = { RUNNING: '작업 중', WAITING_USER: '응답 대기', COMPLETED: '완료', FAILED: '실패', CANCELLED: '취소됨', PENDING: '대기 중' };

export default function DotContext({ profile, sessionId = 'computer-1', computer, conversation, execution, artifacts, online, dot, activity, section, onSection, onCustomize, onComputer, onPip, onFile, onSettings, onMenu, onActivity, onClose }: {
  profile: DotProfile; sessionId?: string; computer: Computer; conversation: Conversation | null; execution: ExecutionState;
  artifacts: File[]; online: boolean; dot: DotSummary | null; activity: DotActivityRow[];
  section: Section; onSection: (section: Section) => void; onCustomize: () => void; onComputer: () => void; onPip: () => void;
  onFile: (path: string) => void; onSettings: () => void; onMenu: (x: number, y: number) => void;
  onActivity: (row: DotActivityRow) => void; onClose: () => void;
}) {
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [allFiles, setAllFiles] = useState(false);
  const [computersOpen, setComputersOpen] = useState(true);
  const scroll = useRef<HTMLElement>(null);
  const returnFocus = useRef<string | null>(null);
  const activitySection = useRef<HTMLElement>(null);
  const outputSection = useRef<HTMLElement>(null);
  const runs = [...(conversation?.runs || [])].reverse();
  const selected = runs.find(run => run.id === selectedRun);
  const current = runs.find(run => ['RUNNING', 'WAITING_USER', 'PENDING'].includes(run.status)) || runs[0];
  const activityKind = dotActivity(current, current ? execution[current.id] : undefined);
  const status = dotStatusLabel(dot?.status || 'ACTIVE', {
    running: !!current && ['RUNNING', 'PENDING'].includes(current.status),
    waiting: current?.status === 'WAITING_USER' || !online,
  });
  const activityTitle = (run: { id: string }) => conversation?.messages?.find(m => m.run_id === run.id && m.role === 'user')?.text || '작업';
  useEffect(() => { if (section === 'activity') activitySection.current?.scrollIntoView({ block: 'start' }); if (section === 'outputs') outputSection.current?.scrollIntoView({ block: 'start' }); }, [section]);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) onClose(); }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, [onClose]);
  const back = () => {
    setSelectedRun(null);
    onSection('profile');
    requestAnimationFrame(() => {
      const buttons = scroll.current?.querySelectorAll<HTMLButtonElement>('[data-run-id]');
      Array.from(buttons || []).find(button => button.dataset.runId === returnFocus.current)?.focus({ preventScroll: true });
      // Dot-wide rows return focus the same way when the transcript closes.
      if (!returnFocus.current) scroll.current?.querySelector<HTMLButtonElement>('.context-close')?.focus({ preventScroll: true });
    });
  };
  return <aside ref={scroll} className="dot-context" role="dialog" aria-label={profile.name + ' 정보'} data-compact={compact || !!selected} onScroll={event => setCompact(event.currentTarget.scrollTop > 1)}>
    <div className="context-sticky"><div className="context-identity">
      <button className="context-avatar" aria-label="프로필에서 Dot 꾸미기" onClick={onCustomize}><DotAvatar profile={profile} size={64} activity={activityKind} turnId={current?.id} /><span className="context-avatar-pencil"><Pencil size={12} /></span></button>
      <div className="context-name">
        <span className="context-eyebrow">나만의 dot</span>
        <h2>{profile.name}</h2>
        <p className={'context-status' + (dot?.status === 'PAUSED' ? ' paused' : '')}><i className={'status-dot ' + (!online ? 'offline' : '')} />{status}<span className="context-last-active">마지막 활성 {relativeTime(dot?.last_active_at)}</span></p>
      </div>
      <button className="icon-button context-menu-trigger" data-dot-menu-trigger aria-label="Dot 메뉴" aria-haspopup="menu" title="Dot 메뉴" onClick={event => onMenu(event.clientX, event.clientY)}><MoreHorizontal size={18} /></button>
      <button className="icon-button context-close" aria-label="정보 패널 닫기" onClick={onClose}><X size={17} /></button>
    </div></div>
    <div className={'context-body ' + (selected ? 'context-transcript' : '')}>
    {selected ? <>
      <button className="context-back" onClick={back}><ArrowLeft size={15} />프로필로 돌아가기</button>
      <h3>활동</h3>
      <p className="context-task-title">{activityTitle(selected)}</p>
      {conversation?.messages?.filter(message => message.run_id === selected.id && message.role === 'assistant').map(message => <div className="context-transcript-message" key={message.sequence}><Markdown>{message.text}</Markdown></div>)}
      {selected.error && <p className="settings-error">{selected.error}</p>}
      <RunActivity key={selected.id} run={selected} execution={execution[selected.id]} />
    </> : section === 'activity' ? <>
      <button className="context-back" onClick={() => onSection('profile')}><ArrowLeft size={15} />프로필로 돌아가기</button>
      <section className="context-group" ref={activitySection}>
        <h3>최근 활동 <span>{activity.length || ''}</span></h3>
        {activity.length ? <div className="context-list">{activity.map(row => <button key={row.id} data-run-id={row.id} onClick={() => onActivity(row)}>
        {row.status === 'RUNNING' ? <Loader2 size={17} className="spin" /> : row.status === 'COMPLETED' ? <Check size={17} /> : <Circle size={16} />}
        <span>{row.id === current?.id ? activityTitle(row) : row.dot_name + ' · ' + relativeTime(row.created_at)}<small>{relativeTime(row.created_at)} · {RUN_LABELS[row.status] || row.status}</small></span>
        <ChevronRight size={14} /></button>)}</div> : <p className="context-empty">작업을 시작하면 여기에 표시돼요.</p>}
      </section>
    </> : <>
      <div className="context-actions">
        <button onClick={onCustomize}><Pencil size={15} />꾸미기</button>
        <button onClick={onSettings}><Settings2 size={15} />설정</button>
        <button className="context-call" disabled title={CALL_UNAVAILABLE} aria-label={'통화하기. ' + CALL_UNAVAILABLE}><Phone size={15} />통화하기</button>
      </div>
      <p className="context-call-note">{CALL_UNAVAILABLE}</p>
      <section className="context-group">
        <button className="context-section-toggle" aria-expanded={computersOpen} onClick={() => setComputersOpen(!computersOpen)}>컴퓨터<ChevronDown size={14} className={computersOpen ? '' : 'collapsed'} /></button>
        {computersOpen && <button className="context-computer" onClick={onComputer}>
          <span className="context-computer-icon"><Monitor size={20} /><i className={'status-dot ' + (!computer.connected ? 'offline' : '')} /></span>
          <span>{profile.name}의 컴퓨터<small>{computer.connected ? 'Connected' : 'Offline'}</small></span>
          <ComputerThumbnail key={sessionId} sessionId={sessionId} name={profile.name} />
        </button>}
        {computersOpen && <button className="context-pip" onClick={onPip} disabled={!computer.connected} title={computer.connected ? '떠 있는 창으로 보기' : '컴퓨터가 연결되면 사용할 수 있어요'}><PictureInPicture2 size={15} />떠 있는 창으로 보기</button>}
      </section>
      <section className="context-group">
        <h3>활동 <span>{runs.length || ''}</span></h3>
        {runs.length ? <div className="context-list">{runs.map(run => <button key={run.id} data-run-id={run.id} onClick={() => { returnFocus.current = run.id; setSelectedRun(run.id); scroll.current?.scrollTo({ top: 0 }); }}>
          {run.status === 'RUNNING' ? <Loader2 size={17} className="spin" /> : run.status === 'COMPLETED' ? <Check size={17} /> : <Circle size={16} />}
          <span>{activityTitle(run)}<small>{RUN_LABELS[run.status] || run.status}</small></span>
          <ChevronRight size={14} /></button>)}</div> : <p className="context-empty">작업을 시작하면 여기에 표시돼요.</p>}
        <button className="context-show-all" onClick={() => onSection('activity')}>이 Dot의 최근 활동 모두 보기</button>
      </section>
      <section className="context-group" ref={outputSection}>
        <h3>결과물 <span>{artifacts.length || ''}</span></h3>
        {artifacts.length ? <div className="context-list">{(allFiles ? artifacts : artifacts.slice(0, 4)).map(file => <button key={file.path} onClick={() => onFile(file.path)}><FileText size={17} /><span title={file.path}>{file.path.split('/').at(-1)}<small>{file.path}</small></span><ChevronRight size={14} /></button>)}</div> : <p className="context-empty">함께 만든 문서와 파일이 모여요.</p>}
        {artifacts.length > 4 && <button className="context-show-all" onClick={() => setAllFiles(!allFiles)}>{allFiles ? '간략히 보기' : `파일 ${artifacts.length}개 모두 보기`}</button>}
        <button className="context-show-all" onClick={onComputer}><Maximize2 size={13} />컴퓨터에서 파일 열기</button>
      </section>
    </>}
    </div>
  </aside>;
}
