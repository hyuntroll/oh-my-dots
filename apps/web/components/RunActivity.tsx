'use client';
import { useEffect, useId, useState } from 'react';
import { AppWindow, BookOpen, ChevronDown, FilePenLine, FileText, Globe, Image, MessageCircle, Terminal, Loader2 } from 'lucide-react';
import type { Run } from '../lib/api';
import { executionLabel, stepStatus, toolSteps, type Execution, type ToolStep } from '../lib/execution';

const toolLabels: Record<string, [typeof Terminal, string, string]> = {
  skills_list: [BookOpen, '스킬 찾는 중', '스킬 목록 확인함'],
  skill_read: [BookOpen, '작업 절차 읽는 중', '작업 절차 확인함'],
  shell_exec: [Terminal, '명령 실행 중', '명령 실행함'],
  desktop_screenshot: [Image, '화면 확인 중', '이미지 1개 확인함'],
  desktop_input: [Globe, '컴퓨터 조작 중', '컴퓨터 사용함'],
  desktop_windows: [AppWindow, '열린 창 확인 중', '열린 창 확인함'],
  artifact_write: [FilePenLine, '파일 작성 중', '파일 작성함'],
  artifact_read: [FileText, '파일 확인 중', '파일 확인함'],
  ask_user: [MessageCircle, '답변 기다리는 중', '사용자 답변 확인함'],
};
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function duration(ms: number): string { return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}초`; }

function ToolRow({ step, run, now }: { step: ToolStep; run: Run; now: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const [Icon, runningLabel, completedLabel] = toolLabels[step.name] ?? [AppWindow, '도구 실행 중', '도구 실행함'];
  const status = stepStatus(step, run.status);
  const input = step.start?.payload ?? {};
  const output = step.end?.payload ?? {};
  const elapsed = typeof output.duration_ms === 'number' ? output.duration_ms
    : step.start && step.end ? Math.max(0, (step.end.created_at - step.start.created_at) * 1000)
    : status === 'running' && step.start ? Math.max(0, now - step.start.created_at * 1000) : null;
  const command = text(input.command), path = text(input.path), stdout = text(output.stdout), stderr = text(output.stderr);
  const error = text(output.error);
  const skill = text(output.skill_title) || text(input.skill_id);
  const details = Boolean(command || path || skill || stdout || stderr || error || output.exit_code !== undefined);
  const label = status === 'running' ? runningLabel : status === 'failed' ? '실행 실패' : status === 'cancelled' ? '실행 취소됨' : status === 'interrupted' ? '실행 중단됨' : completedLabel;
  const content = <><Icon size={16} aria-hidden="true" /><span className="tool-label">{label}{(command || path || skill) && <span className="tool-preview">{command ? command.split('\n')[0] : path || skill}</span>}</span>{elapsed !== null && <span className="tool-duration">{duration(elapsed)}</span>}{status === 'running' && <Loader2 size={12} className="spin" aria-label="진행 중" />}{details && <ChevronDown size={13} className="activity-chevron" aria-hidden="true" />}</>;
  return <li className={'tool-step tool-' + status}>
    {details ? <button className="tool-row" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>{content}</button> : <div className="tool-row">{content}</div>}
    {details && open && <div className="tool-details" id={id}>
      <div className="tool-detail-heading"><span>{step.name === 'shell_exec' ? 'Shell' : '실행 상세'}</span><span>{output.timed_out ? '시간 초과' : typeof output.exit_code === 'number' ? `종료 코드 ${output.exit_code}` : label}</span></div>
      {command && <pre className="tool-command">$ {command}</pre>}
      {input.command_truncated === true && <small>긴 명령의 앞부분만 표시합니다.</small>}
      {text(input.cwd) && <div className="tool-directory">작업 폴더 · {text(input.cwd)}</div>}
      {path && <pre>{path}</pre>}
      {skill && <p>{skill}</p>}
      {text(output.skill_sha256) && <small>읽은 설명서 버전 · {text(output.skill_sha256).slice(0, 12)}</small>}
      {stdout && <pre aria-label="표준 출력">{stdout}</pre>}
      {stderr && <pre className="tool-stderr" aria-label="오류 출력">{stderr}</pre>}
      {error && <p>{error}</p>}
      {(output.stdout_truncated === true || output.stderr_truncated === true) && <small>긴 출력의 앞부분만 표시합니다.</small>}
      {!stdout && !stderr && !error && step.name === 'shell_exec' && <p className="tool-empty">{status === 'running' ? '실행 중 · 명령이 끝나면 출력이 표시됩니다.' : step.end && output.stdout !== undefined ? '출력 없이 종료되었습니다.' : '저장된 출력이 없습니다.'}</p>}
    </div>}
  </li>;
}

export default function RunActivity({ run, execution }: { run: Run; execution?: Execution }) {
  const active = ['RUNNING', 'WAITING_USER', 'PENDING'].includes(run.status);
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const id = useId();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const steps = toolSteps(execution);
  if (!active && !steps.length) return null;
  const open = expanded ?? active;
  const elapsed = run.started_at && run.finished_at ? duration((run.finished_at - run.started_at) * 1000) : '';
  const label = active ? run.status === 'PENDING' ? '시작을 기다리고 있어요' : run.status === 'WAITING_USER' ? run.wait_reason === 'CONTROL' ? '제어권 반환을 기다리고 있어요' : '답변을 기다리고 있어요' : executionLabel(execution)
    : `${steps.length}개 작업 ${run.status === 'COMPLETED' ? '완료' : run.status === 'CANCELLED' ? '· 취소됨' : '· 종료됨'}${elapsed ? ' · ' + elapsed : ''}`;
  return <section className={'run-activity' + (active ? ' is-active' : '')} aria-label="작업 기록">
    <button className="activity-heading" onClick={() => setExpanded(!open)} aria-expanded={open} aria-controls={id} disabled={!steps.length}>
      {active && <span className="activity-pulse" aria-hidden="true" />}<span role={active ? 'status' : undefined}>{label}</span>{steps.length > 0 && <ChevronDown size={14} className="activity-chevron" aria-hidden="true" />}
    </button>
    {open && steps.length > 0 && <ol className="tool-list" id={id}>{steps.map(step => <ToolRow key={step.id} step={step} run={run} now={now} />)}</ol>}
  </section>;
}
