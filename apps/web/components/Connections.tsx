'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronRight, Monitor, Search } from 'lucide-react';
import SkillsCatalog from './SkillsCatalog';
import ServiceLogo from './ServiceLogo';
import { api, post, type Computer } from '../lib/api';
const services = [
  { id: 'gmail', name: 'Gmail', color: '#ea4335', description: '메일을 찾고, 대화를 정리하고, 답장을 준비하세요.', examples: ['최근 프로젝트 메일을 요약하고 결정 사항과 다음 할 일을 정리해줘', '마지막으로 받은 메일에 대한 답장 초안을 작성해줘', '최근 메일에서 담당자와 마감일을 찾아 정리해줘'] },
  { id: 'calendar', name: 'Google Calendar', color: '#4285f4', description: '일정을 살펴보고 중요한 회의를 준비하세요.', examples: ['이번 주 일정을 확인하고 준비할 일을 정리해줘', '내 일정에서 가장 빠른 1시간 회의 후보를 찾아줘'] },
  { id: 'drive', name: 'Google Drive', color: '#34a853', description: '문서와 자료를 찾아 함께 작업하세요.', examples: ['최근 프로젝트 문서를 찾아 핵심 내용을 정리해줘', '프로젝트 점검 문서를 읽고 회의 안건 초안을 만들어줘'] },
  { id: 'slack', name: 'Slack', color: '#b66ec2', description: '팀의 대화에서 소식과 다음 할 일을 찾으세요.', examples: ['팀 채널의 새 소식을 정리해줘', '프로젝트 대화에서 결정 사항과 담당자를 정리해줘'] },
] as const;
export default function Connections({ onOpenComputer, onCompose }: { onOpenComputer: (state: Computer) => void; onCompose: (prompt: string) => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<typeof services[number] | null>(null);
  type Connection = { id: string; configured: boolean; connected: boolean; operations: string[]; scope: string };
  const [connections, setConnections] = useState<Connection[]>([]);
  const [skillCount, setSkillCount] = useState<number | null>(null);
  useEffect(() => { api<{ skills: unknown[] }>('/skills').then(value => setSkillCount(value.skills.length)).catch(() => {}); }, []);
  const [tab, setTab] = useState('플러그인');
  const refresh = () => api<{ services: Connection[] }>('/integrations').then(value => setConnections(value.services));
  useEffect(() => { refresh().catch(e => setError(e.message)); const timer = setInterval(() => { refresh().catch(() => {}); }, 5000); return () => clearInterval(timer); }, []);
  const state = connections.find(connection => connection.id === selected?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connect = async () => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try { const result = await api<{ url: string }>('/integrations/' + selected.id + '/connect', post()); window.location.assign(result.url); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const matches = services.filter(service => (service.name + service.description).toLowerCase().includes(query.toLowerCase()));
  return <div className="plugins-workspace">
    {selected ? <>
      <nav className="plugin-breadcrumb" aria-label="현재 위치"><button onClick={() => { setSelected(null); setError(''); }}>플러그인</button><ChevronRight size={16} /><span>{selected.name}</span></nav>
      <div className="plugin-detail-title"><span className="plugin-logo large" style={{ color: selected.color }}><ServiceLogo service={selected.id} size={52} /></span><div className="plugin-title-row"><h2>{selected.name}</h2><button className="button" onClick={() => onCompose(selected.name + '을 사용해 최근 소식을 정리해줘')}>지금 사용해 보기</button><button className="plugin-primary" disabled={busy} onClick={connect}>{busy ? '연결 중…' : state?.connected ? '다시 연결' : '연결하기'}<ArrowUpRight size={16} /></button></div><p>{selected.description}</p></div>
      <section className="plugin-examples" aria-label="사용 예시">{selected.examples.map(example => <button key={example} onClick={() => onCompose(selected.name + '에서 ' + example)}><span><strong style={{ color: selected.color }}>{selected.name}</strong> {example}</span><ArrowUpRight size={20} /></button>)}</section>
      <p className="plugin-summary">{selected.name}을 사용해 자료를 찾고, 내용을 정리하고, 다음 작업을 준비하세요.</p>
      <section className="plugin-section"><h3>연결 방식</h3><div className="plugin-connection-row"><span className="plugin-logo" style={{ color: selected.color }}><ServiceLogo service={selected.id} /></span><div><strong>{selected.name}</strong><p>{state?.connected ? 'OAuth 연결됨 · API 우선 사용' : state?.configured ? 'OAuth 계정 연결 필요' : '서버 OAuth 클라이언트 설정 필요'}</p></div><Monitor size={20} /></div><p className="settings-help">연결한 계정의 읽기 권한을 사용합니다. API가 지원하는 작업을 우선 실행하고, 그 외 작업은 dot 컴퓨터에서 이어갑니다.</p></section>
      <section className="plugin-section"><h3>정보</h3><dl className="plugin-info"><div><dt>현재 지원</dt><dd>OAuth 읽기 API · 브라우저 컴퓨터 사용</dd></div><div><dt>API / OAuth 연결</dt><dd>{state?.connected ? '연결됨' : state?.configured ? '연결 가능' : '설정 필요'}</dd></div><div><dt>계정 해제</dt><dd>저장된 토큰을 삭제합니다. 서비스의 앱 권한 철회는 계정 설정에서 할 수 있습니다.</dd></div><div><dt>API 기능</dt><dd>{state?.operations.join(' · ') || '확인 중'}</dd></div><div><dt>권한</dt><dd>읽기 전용 · 전송과 수정은 브라우저에서 확인 후 실행</dd></div></dl>{state?.connected && <button className="button" onClick={async () => { try { await api('/integrations/' + selected.id, { method: 'DELETE' }); await refresh(); } catch (e) { setError((e as Error).message); } }}>연결 해제</button>}<button className="button" onClick={async () => { try { onOpenComputer(await api<Computer>('/connections/' + selected.id + '/open', post())); } catch (e) { setError((e as Error).message); } }}><Monitor size={16} />컴퓨터에서 열기</button></section>
    </> : <>
      <div className="plugin-toolbar"><div className="plugin-tabs">{['플러그인', '앱', 'MCP', '스킬'].map(label => <button key={label} aria-pressed={tab === label} onClick={() => setTab(label)}>{label} <small>{label === '플러그인' || label === '앱' ? services.length : label === '스킬' ? skillCount ?? '…' : 0}</small></button>)}</div><label className="settings-search"><Search size={18} /><input aria-label="플러그인 검색" placeholder="플러그인 검색" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
      <p className="plugin-summary">플러그인, 앱, MCP 연결을 관리합니다. 연결된 앱은 API를 우선 사용합니다.</p>
      {(tab === '플러그인' || tab === '앱') ? <div className="plugin-list">{matches.map(service => <button className="plugin-row" key={service.id} onClick={() => { setSelected(service); setError(''); }}><span className="plugin-logo" style={{ color: service.color }}><ServiceLogo service={service.id} size={36} /></span><span className="plugin-row-copy"><strong>{service.name}</strong><small>{service.description}</small></span><span className={'settings-badge ' + (connections.find(c => c.id === service.id)?.connected ? 'connected' : '')}>{connections.find(c => c.id === service.id)?.connected ? '연결됨' : '연결 필요'}</span><ChevronRight size={18} /></button>)}</div> : tab === '스킬' ? <SkillsCatalog /> : <div className="settings-card"><h3>{tab}</h3><p>설치된 {tab} 연결이 없습니다.</p><p className="settings-help">내장 작업 절차는 설정의 스킬 메뉴에서 볼 수 있습니다. 사용자 MCP 서버 설치는 아직 지원하지 않습니다.</p></div>}
      {!matches.length && <p className="settings-help">일치하는 앱이 없습니다.</p>}
    </>}
    {error && <p className="settings-error" role="alert">{error}</p>}
  </div>;
}
