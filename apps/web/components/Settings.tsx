'use client';
import { useEffect, useState } from 'react';
import { Check, KeyRound, X, ExternalLink } from 'lucide-react';
import { api, post, AuthSettings, UsageSummary } from '../lib/api';
export default function Settings({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<AuthSettings | null>(null);
  const [provider, setProvider] = useState<'codex' | 'openai'>('codex');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [saved, setSaved] = useState(false);
  const refresh = async () => { api<UsageSummary>('/usage').then(setUsage).catch(() => {}); const s = await api<AuthSettings>('/settings'); setSettings(s); return s; };
  useEffect(() => { refresh().then(s => { setProvider(s.provider); setModel(s.model); }).catch(e => setError(e.message)); const timer = setInterval(() => { refresh().catch(() => {}); }, 2500); return () => clearInterval(timer); }, []);
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler); }, [onClose]);
  const save = async () => { setBusy(true); setError(''); try { await api('/settings', { method: 'PUT', body: JSON.stringify({ provider, model, ...(key ? { api_key: key } : {}) }) }); setKey(''); setSaved(true); await refresh(); onSaved(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const login = async () => { setBusy(true); setError(''); try { await api('/settings/codex/login', post()); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <div className="modal-backdrop" onClick={onClose}><section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="settings-modal" onClick={e => e.stopPropagation()}>
    <header><div><KeyRound size={20} /><h2 id="settings-title">OhMyDots 설정</h2></div><button aria-label="설정 닫기" className="icon-button" onClick={onClose}><X size={20} /></button></header>
    <p className="settings-intro">OhMyDots이 사용할 AI와 인증 방식을 선택하세요.</p>
    <div className="provider-options">{(['codex', 'openai'] as const).map(p => <button className={provider === p ? 'selected' : ''} key={p} onClick={() => { setProvider(p); setModel(p === 'openai' ? 'gpt-5.4' : ''); setSaved(false); }}><span><strong>{p === 'codex' ? 'Codex 로그인' : 'OpenAI API'}</strong>{provider === p && <Check size={16} />}</span><small>{p === 'codex' ? 'ChatGPT 계정의 Codex를 사용합니다' : 'API 키와 프로젝트 사용량을 사용합니다'}</small></button>)}</div>
    {provider === 'codex' ? <div className="auth-box"><span className={'auth-status ' + (settings?.codex_connected ? 'ready' : '')}>{settings?.codex_connected ? '● Codex 로그인됨' : '○ Codex 연결 필요'}</span><p>이 서버의 Codex 로그인으로 실행합니다. 로그인 정보는 컴퓨터나 셸에 전달하지 않습니다.</p>{!settings?.codex_connected && <button className="button light" onClick={login} disabled={busy || settings?.login.state === 'waiting'}>ChatGPT로 로그인</button>}{settings?.login.state === 'waiting' && <div className="device-login"><a href={settings.login.url} target="_blank" rel="noreferrer">로그인 화면 열기 <ExternalLink size={14} /></a><p>인증 코드 <strong>{settings.login.code}</strong></p></div>}{settings?.login.state === 'failed' && <p className="error">로그인에 실패했습니다. 계정의 기기 코드 로그인 설정을 확인하고 다시 시도하세요.</p>}</div> : <div className="auth-box"><span className={'auth-status ' + (settings?.openai_configured ? 'ready' : '')}>{settings?.openai_configured ? '● API 키 설정됨' : '○ API 키 설정 필요'}</span><label htmlFor="api-key">OpenAI API 키</label><input id="api-key" type="password" value={key} autoComplete="off" placeholder={settings?.openai_configured ? '새 키를 입력하면 교체됩니다' : 'sk-…'} onChange={e => { setKey(e.target.value); setSaved(false); }} /><p>키는 서버에 저장하며 저장 후 다시 표시하지 않습니다.</p></div>}
    <label htmlFor="model">모델</label><input id="model" value={model} placeholder={provider === 'codex' ? '비워두면 계정 기본 모델' : 'gpt-5.4'} onChange={e => { setModel(e.target.value); setSaved(false); }} />
    <p className="settings-note">실행 중인 작업이 있으면 종료하거나 취소한 뒤 변경할 수 있습니다.</p>
    <section className="usage-panel" aria-label="AI 사용량"><h3>사용량</h3><p>OhMyDots에서 보고받은 토큰을 누적합니다. 계정의 잔여 한도나 청구 금액과는 다릅니다.</p>{usage ? usage.providers.length ? usage.providers.map(row => <div className="usage-provider" key={row.provider}><strong>{row.provider === 'codex' ? 'Codex' : 'OpenAI API'}<small>{row.runs.toLocaleString()}개 작업</small></strong><dl><div><dt>입력 토큰</dt><dd>{row.input_tokens.toLocaleString()}</dd></div><div><dt>출력 토큰</dt><dd>{row.output_tokens.toLocaleString()}</dd></div><div><dt>입력 중 캐시</dt><dd>{row.cached_input_tokens.toLocaleString()}</dd></div></dl></div>) : <span>첫 작업이 사용량을 보고하면 여기에 표시됩니다.</span> : <span>사용량을 불러오는 중…</span>}</section>
    {error && <p role="alert" className="error">{error}</p>}<footer><span>{saved && '설정을 저장했습니다'}</span><button className="button" onClick={save} disabled={busy || !settings}>{busy ? '저장 중…' : '설정 저장'}</button></footer>
  </section></div>;
}
