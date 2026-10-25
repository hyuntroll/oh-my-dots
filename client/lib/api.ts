import type {AppState, Appearance, Profile, Settings, Task} from './types';
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {super(message); this.name='ApiError'; this.status=status;}
}
export async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(path,{method,headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}); }
  catch { throw new ApiError('연결을 확인해 주세요. 요청이 저장됐는지는 대화에서 확인할 수 있어요.'); }
  const data = await response.json().catch(()=>null);
  if (!response.ok) throw new ApiError(typeof data?.error==='string'?data.error:data?.error?.message ?? data?.message ?? '요청을 처리하지 못했어요.',response.status);
  return data as T;
}
export const api = {
  state:()=>request<AppState>('/api/state'),
  createProfile:(draft:{request_id?:string;display_name:string;description?:string;preset?:string;appearance_state?:string;snapshot?:string})=>request<Profile>('/api/profiles','POST',draft),
  updateProfile:(id:string,patch:Partial<Profile>)=>request<Profile>(`/api/profiles/${encodeURIComponent(id)}`,'PATCH',patch),
  saveAppearance:(id:string,appearance:Appearance)=>api.updateProfile(id,{preset:appearance.preset,appearance_state:appearance.state,snapshot:appearance.snapshot}),
  deleteProfile:(id:string)=>request(`/api/profiles/${encodeURIComponent(id)}`,'DELETE'),
  sendMessage:(roomId:string,text:string,requestId:string,token:string)=>request<{message?:unknown;task?:Task}>(`/api/messaging/rooms/${encodeURIComponent(roomId)}/messages`,'POST',{content:{text},request_id:requestId,idempotency_token:token}),
  taskAction:(id:string,action:'cancel'|'resume')=>request<Task>(`/api/tasks/${encodeURIComponent(id)}/${action}`,'POST',{}),
  respond:(id:string,decision:'allow'|'deny',value?:string)=>request(`/api/approvals/${encodeURIComponent(id)}/respond`,'POST',{decision,value}),
  settings:(patch:Partial<Settings>)=>request<Settings>('/api/settings','PATCH',patch),
};
