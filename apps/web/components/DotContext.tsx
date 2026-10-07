'use client';
import { useState } from 'react';
import { Check, ChevronRight, Circle, FileText, Loader2, Monitor, Pencil, Settings2, X } from 'lucide-react';
import Markdown from 'react-markdown';
import ComputerThumbnail from './ComputerThumbnail';
import { DotAvatar } from './DotIdentity';
import RunActivity from './RunActivity';
import type { DotProfile } from '../lib/dot-profile';
import type { Computer, Conversation } from '../lib/api';
import type { ExecutionState } from '../lib/execution';

type File = { path: string; size: number };
export default function DotContext({ profile, sessionId = "computer-1", computer, conversation, execution, artifacts, online, section, onCustomize, onComputer, onFile, onSettings, onClose }: { profile: DotProfile; sessionId?: string; computer: Computer; conversation: Conversation | null; execution: ExecutionState; artifacts: File[]; online: boolean; section: 'profile' | 'activity' | 'outputs'; onCustomize: () => void; onComputer: () => void; onFile: (path: string) => void; onSettings: () => void; onClose: () => void }) {
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [allFiles, setAllFiles] = useState(false);
  const visibleFiles = section === 'outputs' || allFiles ? artifacts : artifacts.slice(0, 4);
  const runs = [...(conversation?.runs || [])].reverse();
  const selected = runs.find(r => r.id === selectedRun);
  const working = runs.find(r => r.status === 'RUNNING' || r.status === 'WAITING_USER');
  return <aside className="dot-context" aria-label="Dot 정보"><header className="context-mobile-header"><strong>{section === 'outputs' ? '결과물' : section === 'activity' ? '활동' : '내 dot'}</strong><button className="icon-button" aria-label="정보 패널 닫기" onClick={onClose}><X size={18} /></button></header>{section === 'profile' && <><div className="context-identity"><button className="context-avatar" aria-label="프로필에서 Dot 꾸미기" onClick={onCustomize}><DotAvatar profile={profile} size={68} /><span><Pencil size={13} /></span></button><div><h2>{profile.name}</h2><p>{working ? working.status === 'WAITING_USER' ? '답변을 기다리는 중' : '작업 중…' : online ? '함께할 준비가 됐어요' : '연결 중…'}</p></div></div><div className="context-actions"><button onClick={onCustomize}><Pencil size={16} />꾸미기</button><button onClick={onSettings}><Settings2 size={16} />AI 연결</button></div><h3>Computers</h3><button className="context-computer" onClick={onComputer}><ComputerThumbnail key={sessionId} sessionId={sessionId} name={profile.name} /><span>{profile.name}’s computer<small><i className={'status-dot ' + (!computer.connected ? 'offline' : '')} />{computer.connected ? 'Connected' : 'Offline'}</small></span><ChevronRight size={17} /></button></>}
    {section !== 'outputs' && <section className="context-group"><h3>활동 <span>{runs.length || ''}</span></h3>{runs.length ? <div className="context-list">{runs.map(run => <button key={run.id} aria-expanded={selectedRun === run.id} onClick={() => setSelectedRun(selectedRun === run.id ? null : run.id)}>{run.status === 'RUNNING' ? <Loader2 size={17} className="spin" /> : run.status === 'COMPLETED' ? <Check size={17} /> : <Circle size={16} />}<span>{conversation?.messages?.find(m => m.run_id === run.id && m.role === 'user')?.text || '작업'}<small>{({ RUNNING: '작업 중', WAITING_USER: '응답 대기', COMPLETED: '완료', FAILED: '실패', CANCELLED: '취소됨', PENDING: '대기 중' } as Record<string, string>)[run.status]}</small></span><ChevronRight size={16} /></button>)}</div> : <p className="context-empty">작업을 시작하면 여기에 표시돼요.</p>}{selected && <div className="context-run-detail" role="region" aria-label="선택한 작업"><p>{conversation?.messages?.find(m => m.run_id === selected.id && m.role === 'user')?.text || '작업'}</p>{selected.error && <p className="settings-error">{selected.error}</p>}<RunActivity key={selected.id} run={selected} execution={execution[selected.id]} /></div>}</section>}
    <section className="context-group"><h3>결과물 <span>{artifacts.length || ''}</span></h3><p className="context-caption">모든 대화에서 만든 파일</p>{artifacts.length ? <div className="context-list">{visibleFiles.map(file => <button key={file.path} onClick={() => onFile(file.path)}><FileText size={17} /><span title={file.path}>{file.path.split('/').at(-1)}<small>{file.path}</small></span><ChevronRight size={16} /></button>)}</div> : <p className="context-empty">함께 만든 문서와 파일이 모여요.</p>}{section !== 'outputs' && artifacts.length > 4 && <button className="context-show-all" onClick={() => setAllFiles(!allFiles)}>{allFiles ? '간략히 보기' : `파일 ${artifacts.length}개 모두 보기`}<ChevronRight size={13} /></button>}</section>
  </aside>;
}
export function ArtifactWorkspace({ file, files, onFile, onClose }: { file: { path: string; text: string }; files: File[]; onFile: (path: string) => void; onClose: () => void }) {
  const markdown = /\.(md|markdown)$/i.test(file.path);
  return <section className="artifact-workspace" aria-label="결과 파일"><header><FileText size={19} /><strong>{file.path.split('/').at(-1)}</strong><button className="icon-button" aria-label="결과 파일 닫기" onClick={onClose}><X size={19} /></button></header><div className="artifact-tabs" aria-label="결과물 선택">{files.map(item => <button key={item.path} aria-current={item.path === file.path ? 'page' : undefined} onClick={() => onFile(item.path)}>{item.path.split('/').at(-1)}</button>)}</div><article className="artifact-document"><p className="artifact-path">{file.path}</p>{markdown ? <Markdown>{file.text}</Markdown> : <><h1>{file.path.split('/').at(-1)}</h1><pre>{file.text}</pre></>}</article></section>;
}
