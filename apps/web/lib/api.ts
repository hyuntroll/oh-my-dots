export async function api<T = unknown>(path: string, options: RequestInit = {}, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('요청 시간이 초과되었습니다. 다시 시도해 주세요.', 'TimeoutError')), timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  try {
    const response = await fetch('/api' + path, {
      ...options,
      signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      credentials: 'same-origin', cache: 'no-store',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.detail === 'string' ? body.detail : `요청 실패 (${response.status})`);
    }
    return await response.json();
  } finally { clearTimeout(timer); }
}
export const post = (body: unknown = {}) => ({ method: 'POST', body: JSON.stringify(body) });
export type Run = { id: string; status: string; wait_reason: string | null; error: string | null; task_id: string };
export type Message = { sequence: number; role: string; text: string; run_id: string | null };
export type Conversation = { id: string; title: string; messages?: Message[]; runs?: Run[] };
export type Computer = { connected: boolean; owner: 'AGENT' | 'USER' | null; epoch: number | null; handoff: boolean; width?: number; height?: number };
export type Activity = { sequence: number; run_id: string | null; type: string; summary: string; created_at: number; payload: Record<string, unknown> };
export type AuthSettings = { provider: 'codex' | 'openai'; model: string; openai_configured: boolean; codex_installed: boolean; codex_connected: boolean; login: { state: string; url?: string; code?: string } };
