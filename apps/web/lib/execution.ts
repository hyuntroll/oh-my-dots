import type { Activity } from './api';
export type Execution = { activity?: Activity; message?: Activity; usage?: Activity; tools?: Activity[] };
export type ExecutionState = Record<string, Execution>;
export function mergeExecution(state: ExecutionState, events: Activity[]): ExecutionState {
  let next = state;
  for (const event of events) {
    if (event.run_id && ['tool.started', 'tool.completed', 'tool.failed', 'tool.cancelled'].includes(event.type)) {
      const run = next[event.run_id];
      if (run?.tools?.some(previous => previous.sequence === event.sequence)) continue;
      next = { ...next, [event.run_id]: { ...run, tools: [...(run?.tools ?? []), event].sort((a, b) => a.sequence - b.sequence) } };
      continue;
    }
    const field = event.type === 'run.activity' ? 'activity' : event.type === 'message.updated' ? 'message' : event.type === 'run.usage' ? 'usage' : null;
    if (!field || !event.run_id || (next[event.run_id]?.[field]?.sequence ?? 0) >= event.sequence) continue;
    next = { ...next, [event.run_id]: { ...next[event.run_id], [field]: event } };
  }
  return next;
}
export function executionLabel(execution?: Execution): string {
  if ((execution?.message?.sequence ?? 0) > (execution?.activity?.sequence ?? 0)) return '답변을 작성하고 있어요';
  return execution?.activity?.summary || '요청을 확인하고 있어요';
}
export function tokenCount(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0; }

export type ToolStep = { id: string; name: string; start?: Activity; end?: Activity };
export function toolSteps(execution?: Execution): ToolStep[] {
  const steps: ToolStep[] = [];
  for (const event of execution?.tools ?? []) {
    const callId = typeof event.payload.call_id === 'string' ? event.payload.call_id : null;
    let step = callId ? steps.find(s => s.id === callId) : event.type !== 'tool.started'
      ? steps.findLast(s => s.name === event.summary && !s.end) : undefined;
    if (!step) {
      step = { id: callId ?? String(event.sequence), name: event.summary };
      steps.push(step);
    }
    if (event.type === 'tool.started') step.start = event;
    else step.end = event;
  }
  return steps;
}
export function stepStatus(step: ToolStep, runStatus: string): 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted' {
  if (step.end?.type === 'tool.cancelled') return 'cancelled';
  if (step.end?.type === 'tool.failed' || step.end?.payload.timed_out ||
      (typeof step.end?.payload.exit_code === 'number' && step.end.payload.exit_code !== 0)) return 'failed';
  if (step.end) return 'completed';
  return ['RUNNING', 'WAITING_USER', 'PENDING'].includes(runStatus) ? 'running' : 'interrupted';
}
