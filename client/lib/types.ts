export interface Profile {
  id: string; display_name: string; description?: string; preset: string;
  appearance_state?: string | null; snapshot?: string | null; is_paused: boolean;
  status: 'idle' | 'working' | 'needs_input' | 'paused' | 'error' | string;
  room_id: string; active_root_thread_id?: string | null; created_at: string;
}
export interface Room { id: string; profile_id?: string; task_id?: string; }
export interface Message {
  id: string; room_id: string; role: 'user' | 'assistant' | 'system'; content: {text: string};
  request_id?: string; task_id?: string; from_profile_id?: string; created_at: string;
}
export interface TaskItem {
  id: string; type: 'text' | 'tool_call' | 'approval' | 'question' | 'artifact';
  text?: string; status?: string; name?: string; kind?: string; args?: Record<string, unknown>;
  result?: unknown; error?: string; path?: string; command?: string; content?: string;
  question?: string; display_name?: string; warning?: string; decision?: string; value?: string;
  created_at?: string; action?: string; profile_id?: string;
}
export type TaskStatus = 'queued' | 'in_progress' | 'needs_input' | 'paused' | 'completed' | 'cancelled' | 'interrupted' | 'error';
export interface Task {
  id: string; profile_id: string; room_id: string; status: TaskStatus; title: string;
  items: TaskItem[]; error?: string; created_at: string; completed_at?: string;
}
export interface Settings { model: string; theme: 'system' | 'light' | 'dark'; computer_url?: string; }
export interface RuntimeInfo { provider: 'opencode'; installed: boolean; model?: string; models?: string[]; error?: string; }
export interface AppState { profiles: Profile[]; rooms: Room[]; messages: Message[]; tasks: Task[]; settings: Settings; runtime: RuntimeInfo; revision?: number; }
export interface Appearance { preset: string; state: string; snapshot?: string; }
export const taskLabels: Record<TaskStatus, string> = {queued:'기다리는 중',in_progress:'작업 중',needs_input:'응답 필요',paused:'일시정지',completed:'완료',cancelled:'중지됨',interrupted:'중단됨',error:'확인 필요'};
export const activeStatuses = new Set<TaskStatus>(['queued','in_progress','needs_input']);
export function characterActivity(profile: Profile, task?: Task): {kind:number;turnId:string|null} {
  const turnId = task?.id ?? null;
  if (profile.is_paused || task?.status === 'paused') return {kind:8,turnId};
  if (task?.status === 'needs_input') return {kind:6,turnId};
  if (task?.status === 'error') return {kind:9,turnId};
  if (task && activeStatuses.has(task.status)) {
    const tool = [...task.items].reverse().find(item => item.type === 'tool_call' && item.status === 'running');
    const name = tool?.name ?? '';
    return {kind:/search|list|read|screenshot/.test(name)?2:/write|create/.test(name)?3:/payment|purchase/.test(name)?4:tool?1:5,turnId};
  }
  return {kind:7,turnId};
}
