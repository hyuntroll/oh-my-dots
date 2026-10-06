import type { Activity } from './api';
export type Execution = { activity?: Activity; message?: Activity; usage?: Activity };
export type ExecutionState = Record<string, Execution>;
export function mergeExecution(state: ExecutionState, events: Activity[]): ExecutionState {
  let next = state;
  for (const event of events) {
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
