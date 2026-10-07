'use client';
import { useState } from 'react';
import { ArrowUpRight, CalendarDays, ChevronRight, FolderOpen, Mail, MessageSquare, Monitor, Search } from 'lucide-react';
import { api, post, type Computer } from '../lib/api';
const services = [
  { id: 'gmail', name: 'Gmail', icon: Mail, color: '#ea4335', description: '메일을 찾고, 대화를 정리하고, 답장을 준비하세요.', examples: ['최근 프로젝트 메일을 요약하고 결정 사항과 다음 할 일을 정리해줘', '마지막으로 받은 메일에 대한 답장 초안을 작성해줘'] },
  { id: 'calendar', name: 'Google Calendar', icon: CalendarDays, color: '#4285f4', description: '일정을 살펴보고 중요한 회의를 준비하세요.', examples: ['이번 주 일정을 확인하고 준비할 일을 정리해줘', '내 일정에서 가장 빠른 1시간 회의 후보를 찾아줘'] },
  { id: 'drive', name: 'Google Drive', icon: FolderOpen, color: '#34a853', description: '문서와 자료를 찾아 함께 작업하세요.', examples: ['최근 프로젝트 문서를 찾아 핵심 내용을 정리해줘', '프로젝트 점검 문서를 읽고 회의 안건 초안을 만들어줘'] },
  { id: 'slack', name: 'Slack', icon: MessageSquare, color: '#b66ec2', description: '팀의 대화에서 소식과 다음 할 일을 찾으세요.', examples: ['팀 채널의 새 소식을 정리해줘', '프로젝트 대화에서 결정 사항과 담당자를 정리해줘'] },
] as const;
export default function Connections({ onOpenComputer, onCompose }: { onOpenComputer: (state: Computer) => void; onCompose: (prompt: string) => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<typeof services[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connect = async () => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try { onOpenComputer(await api<Computer>('/connections/' + selected.id + '/open', post())); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const matches = services.filter(service => (service.name + service.description).toLowerCase().includes(query.toLowerCase()));
  return <div className="plugins-workspace">
    {selected ? <>
      <nav className="plugin-breadcrumb" aria-label="현재 위치"><button onClick={() => { setSelected(null); setError(''); }}>플러그인</button><ChevronRight size={16} /><span>{selected.name}</span></nav>
      <div className="plugin-detail-title"><span className="plugin-logo large" style={{ color: selected.color }}><selected.icon size={42} /></span><div className="plugin-title-row"><h2>{selected.name}</h2><button className="plugin-primary" disabled={busy} onClick={connect}>{busy ? '컴퓨터를 여는 중…' : '브라우저에서 로그인'}<ArrowUpRight size={16} /></button></div><p>{selected.description}</p></div>
      <section className="plugin-examples" aria-label="사용 예시">{selected.examples.map(example => <button key={example} onClick={() => onCompose(selected.name + '에서 ' + example)}><span><strong style={{ color: selected.color }}>{selected.name}</strong> {example}</span><ArrowUpRight size={20} /></button>)}</section>
      <p className="plugin-summary">{selected.name}을 사용해 자료를 찾고, 내용을 정리하고, 다음 작업을 준비하세요.</p>
      <section className="plugin-section"><h3>연결 방식</h3><div className="plugin-connection-row"><span className="plugin-logo" style={{ color: selected.color }}><selected.icon size={26} /></span><div><strong>{selected.name}</strong><p>dot 컴퓨터의 브라우저 로그인</p></div><Monitor size={20} /></div><p className="settings-help">로그인 화면을 열고 제어권을 넘겨드립니다. 직접 로그인한 뒤 Return control을 누르면 같은 브라우저에서 작업을 이어갑니다.</p></section>
      <section className="plugin-section"><h3>정보</h3><dl className="plugin-info"><div><dt>현재 지원</dt><dd>브라우저 세션을 통한 컴퓨터 사용</dd></div><div><dt>API / OAuth 연결</dt><dd>아직 제공하지 않음</dd></div><div><dt>계정 해제</dt><dd>서비스의 로그아웃 기능에서 해제</dd></div></dl></section>
    </> : <>
      <div className="plugin-toolbar"><div className="plugin-tabs"><span>앱 <small>{services.length}</small></span></div><label className="settings-search"><Search size={18} /><input aria-label="플러그인 검색" placeholder="플러그인 검색" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
      <p className="plugin-summary">자주 사용하는 앱을 dot의 컴퓨터에서 함께 사용하세요.</p>
      <div className="plugin-list">{matches.map(service => <button className="plugin-row" key={service.id} onClick={() => { setSelected(service); setError(''); }}><span className="plugin-logo" style={{ color: service.color }}><service.icon size={30} /></span><span className="plugin-row-copy"><strong>{service.name}</strong><small>{service.description}</small></span><span className="plugin-method">브라우저</span><ChevronRight size={18} /></button>)}</div>
      {!matches.length && <p className="settings-help">일치하는 앱이 없습니다.</p>}
    </>}
    {error && <p className="settings-error" role="alert">{error}</p>}
  </div>;
}
