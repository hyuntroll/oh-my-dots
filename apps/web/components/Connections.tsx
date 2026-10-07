'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, CalendarDays, ChevronRight, FolderOpen, Mail, MessageSquare, Monitor, Search } from 'lucide-react';
import { api, post, type Computer } from '../lib/api';
const services = [
  { id: 'gmail', name: 'Gmail', icon: Mail, color: '#d94c3f', description: '필요한 메일을 찾고 대화를 정리하세요.', examples: ['프로젝트 관련 메일 찾아 요약하기', '답장 초안 준비하기'] },
  { id: 'calendar', name: 'Google Calendar', icon: CalendarDays, color: '#4285f4', description: '일정을 살펴보고 하루를 준비하세요.', examples: ['이번 주 일정 확인하기', '참석 가능한 회의 시간 찾기'] },
  { id: 'drive', name: 'Google Drive', icon: FolderOpen, color: '#34a853', description: '문서와 자료를 찾아 함께 작업하세요.', examples: ['최근 문서 찾아 핵심 내용 정리하기', '회의 안건 문서 만들기'] },
  { id: 'slack', name: 'Slack', icon: MessageSquare, color: '#8b4c8f', description: '팀의 대화와 업무 흐름을 이어가세요.', examples: ['채널의 새 소식 정리하기', '대화에서 다음 할 일 찾기'] },
] as const;
export default function Connections({ onOpenComputer }: { onOpenComputer: (state: Computer) => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<typeof services[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connect = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try { const state = await api<Computer>('/connections/' + selected.id + '/open', post()); onOpenComputer(state); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="connections-workspace">
    {selected ? <>
      <button className="connection-back" onClick={() => { setSelected(null); setError(''); }}><ArrowLeft size={16} />앱 둘러보기</button>
      <div className="connection-detail-heading"><span className="connection-logo" style={{ color: selected.color }}><selected.icon size={32} /></span><div><h2>{selected.name}</h2><p>{selected.description}</p></div></div>
      <button className="connection-primary" disabled={busy} onClick={connect}>{busy ? '컴퓨터를 여는 중…' : '로그인하여 사용'}<ArrowUpRight size={17} /></button>
      <section className="connection-info"><h3>dot 컴퓨터에서 연결</h3><p>서비스의 로그인 화면을 열고 컴퓨터 제어권을 넘겨드립니다. 직접 로그인한 뒤 Return control을 누르면 dot이 같은 브라우저에서 작업을 이어갑니다.</p><p>로그인 세션은 dot 컴퓨터의 브라우저에 보관됩니다. API 또는 OAuth 계정 연동은 아직 제공하지 않습니다.</p></section>
      <section className="connection-info"><h3>이렇게 사용해 보세요</h3>{selected.examples.map(example => <div className="connection-example" key={example}>{example}<ChevronRight size={14} /></div>)}</section>
      <section className="connection-info"><h3>계정과 작업</h3><p>비밀번호나 인증 코드는 직접 입력하세요. 앱의 로그아웃 기능으로 계정을 해제할 수 있습니다. 문서 저장, 일정 등록, 메시지 발송은 요청한 작업의 확인 절차를 따릅니다.</p></section>
    </> : <>
      <label className="settings-search connection-search"><Search size={17} /><input aria-label="앱 검색" placeholder="앱 검색" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="connection-intro"><Monitor size={17} /><span>dot 컴퓨터의 브라우저로 앱에 로그인하고 함께 작업하세요.</span></div>
      <div className="connection-grid">{services.filter(service => (service.name + service.description).toLowerCase().includes(query.toLowerCase())).map(service => <button className="connection-card" key={service.id} onClick={() => { setSelected(service); setError(''); }}><span className="connection-logo" style={{ color: service.color }}><service.icon size={27} /></span><strong>{service.name}</strong><p>{service.description}</p><span className="connection-card-footer">브라우저에서 사용<ChevronRight size={15} /></span></button>)}</div>
      {!services.some(service => (service.name + service.description).toLowerCase().includes(query.toLowerCase())) && <p className="settings-help">일치하는 앱이 없습니다.</p>}
    </>}
    {error && <p className="settings-error" role="alert">{error}</p>}
  </div>;
}
