'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Check, ChevronRight, Cloud, Folder, Laptop, Mail, ShieldCheck, Sparkles, Users, Workflow, X } from 'lucide-react';
import { DotAvatar, IdentityEditor } from './DotIdentity';
import ServiceLogo from './ServiceLogo';
import { api, post, type Computer } from '../lib/api';
import { DOT_COLORS, type DotProfile } from '../lib/dot-profile';
import DotIntro, { type IntroHandle } from './DotIntro';
import { reduceMotion } from '../lib/dot-motion';

const plugins = [
  { id: 'gmail', title: '이메일', description: '중요한 메일을 찾고 답장을 준비하세요.' },
  { id: 'calendar', title: '캘린더', description: '일정과 회의 준비를 함께하세요.' },
  { id: 'contacts', title: '연락처', description: '함께 일하는 사람들과 연결하세요.' },
  { id: 'drive', title: 'Drive', description: '문서와 파일을 찾아 작업하세요.' },
  { id: 'sharepoint', title: 'SharePoint', description: '팀의 지식과 자료를 연결하세요.' },
  { id: 'teams', title: 'Teams', description: '팀의 대화와 소식을 확인하세요.' },
];
type Connection = { id: string; configured: boolean; connected: boolean };
export default function Onboarding({ profile, computer, onChange, onFinish, onExit }: { profile: DotProfile; computer: Computer; onChange: (value: DotProfile) => void; onFinish: (value: DotProfile) => void; onExit?: () => void }) {
  const [step, setStep] = useState(profile.setupCompleted ? 0 : profile.setupStep);
  const content = useRef<HTMLDivElement>(null);
  const intro = useRef<IntroHandle>(null);
  const flight = useRef<{ rect: DOMRect; node: HTMLElement; previousStep: number } | null>(null);
  const animations = useRef<Animation[]>([]);
  const moving = useRef(false);
  const [transitioning, setTransitioning] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; animations.current.forEach(a => a.cancel()); flight.current?.node.remove(); }; }, []);
  useLayoutEffect(() => {
    const transition = flight.current;
    const destination = content.current?.querySelector<HTMLElement>('[data-dot-anchor], [data-character-destination], .dot-avatar');
    const container = content.current;
    if (!transition || !container || !destination) { transition?.node.remove(); flight.current = null; moving.current = false; setTransitioning(false); return; }
    const finish = () => { animations.current.forEach(a => { try { a.finish(); } catch {} }); };
    const { rect: start, node } = transition, end = destination.getBoundingClientRect();
    destination.style.visibility = 'hidden';
    const copies = Array.from(container.children).filter(el => !el.contains(destination)) as HTMLElement[];
    copies.forEach(el => el.style.opacity = '0');
    const duration = reduceMotion() ? 0 : step === 1 ? 1050 : 650;
    const travel = node.animate([{ transform: 'none' }, { transform: `translate(${end.left - start.left}px,${end.top - start.top}px) scale(${end.width / start.width},${end.height / start.height})` }], { duration, easing: step === 1 ? 'cubic-bezier(.65,0,.35,1)' : 'cubic-bezier(.77,0,.175,1)', fill: 'both' });
    animations.current.push(travel);
    void travel.finished.catch(() => {}).then(() => {
      node.remove(); destination.style.removeProperty('visibility'); flight.current = null;
      if (!alive.current) return;
      copies.forEach((el, index) => { el.style.removeProperty('opacity'); const a = el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: reduceMotion() ? 0 : 800, delay: reduceMotion() ? 0 : index * 100, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }); animations.current.push(a); });
      moving.current = false; setTransitioning(false); heading.current?.focus({ preventScroll: true });
    });
    window.addEventListener('resize', finish); document.addEventListener('visibilitychange', finish);
    return () => { window.removeEventListener('resize', finish); document.removeEventListener('visibilitychange', finish); };
  }, [step]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [notification, setNotification] = useState<NotificationPermission | 'unsupported'>('default');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); setError(''); }, [step]);
  useEffect(() => { setNotification(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission); api<{ services: Connection[] }>('/integrations').then(result => setConnections(result.services)).catch(() => {}); }, []);
  const go = async (next: number, value = profile) => {
    if (moving.current) return;
    moving.current = true; setTransitioning(true);
    if (!reduceMotion()) {
      await intro.current?.settle();
      if (!alive.current) return;
      const source = content.current?.querySelector<HTMLElement>('[data-dot-anchor], [data-character-destination], .dot-avatar');
      if (source) {
        const rect = source.getBoundingClientRect();
        const node = document.createElement('span'); node.className = 'dot-handoff-ring';
        Object.assign(node.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderWidth: `${rect.width * .296}px`, color: DOT_COLORS.find(c => c.id === value.color)?.value || '#b99ef8' });
        document.body.append(node); flight.current = { rect, node, previousStep: step };
      }
      if (content.current) { const a = content.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: step === 0 ? 240 : 280, easing: 'ease-out' }); animations.current.push(a); await a.finished.catch(() => {}); }
    }
    if (alive.current) { setStep(next); onChange({ ...value, setupStep: next }); }
  };
  const connect = async (id: string) => {
    setConnecting(id); setError('');
    try { const result = await api<{ url: string }>('/integrations/' + id + '/connect', post()); window.location.assign(result.url); }
    catch (e) { setError((e as Error).message); setConnecting(null); }
  };
  return <section className={`onboarding step-${step}`} aria-label="Dot 시작하기">
    <header className="onboarding-navigation">
      {step > 0 ? <button className="icon-button" aria-label="이전 단계" onClick={() => go(step - 1)}><ArrowLeft size={20} /></button> : <span />}
      <span className="onboarding-progress" aria-label={`6단계 중 ${step + 1}단계`}>{Array.from({ length: 6 }, (_, i) => <i key={i} data-current={i === step} data-complete={i < step} />)}</span>
      {onExit ? <button className="icon-button" aria-label="시작 안내 닫기" onClick={onExit}><X size={20} /></button> : <span />}
    </header>
    <div className="onboarding-scroll"><div className="onboarding-content" ref={content} key={step} inert={transitioning}>
      {step === 0 && <>
        <DotIntro ref={intro} color={DOT_COLORS.find(c => c.id === profile.color)!.value} />
        <div className="onboarding-heading"><h1 ref={heading} tabIndex={-1}>나만의 dot 만들기</h1><p>복잡한 일도 함께할 수 있는<br />나만의 에이전트를 만나보세요.</p></div>
        <div className="onboarding-features">
          {[{ Icon: Workflow, title: '복잡한 일을 함께', text: '컴퓨터에서 자료를 찾고, 문서를 만들고, 여러 단계의 작업을 이어갑니다.' }, { Icon: Sparkles, title: '더 유용한 도움', text: '사용하는 앱을 연결하고 필요한 맥락을 함께 나누세요.' }, { Icon: ShieldCheck, title: '내가 선택하는 방식으로', text: 'dot의 컴퓨터를 살펴보고 언제든 직접 제어할 수 있습니다.' }].map(({ Icon, title, text }) => <div className="onboarding-feature" key={title}><span><Icon size={22} /></span><div><strong>{title}</strong><p>{text}</p></div></div>)}
        </div>
        <div className="onboarding-actions"><button className="onboarding-primary" onClick={() => go(1)}>계속</button><button className="onboarding-secondary" onClick={() => onFinish(profile)}>나중에 설정</button></div>
      </>}
      {step === 1 && <>
        <div className="onboarding-desktop"><img src="/reference-ui/computer-preview.png" alt="Dot 컴퓨터 예시 화면" /><span><DotAvatar profile={{ ...profile, avatar: 'ring' }} size={20} />{profile.name}의 컴퓨터</span></div>
        <div className="onboarding-heading"><h1 ref={heading} tabIndex={-1}>dot이 어디에서 일할까요?</h1><p>dot에게는 자신만의 컴퓨터가 있어요.<br />컴퓨터 연결은 언제든 변경할 수 있어요.</p></div>
        <div className="onboarding-card"><div className="onboarding-card-rows"><div className="connection-row"><span className="connection-mark"><Cloud size={22} /></span><div><strong>dot의 컴퓨터</strong><small>dot이 작업하는 전용 컴퓨터</small></div><Check size={18} /></div><div className="connection-row"><span className="connection-mark"><Laptop size={22} /></span><div><strong>내 로컬 컴퓨터</strong><small>이 컴퓨터의 앱과 파일에서 작업</small></div><span className="connection-label">준비 중</span></div></div><button className="onboarding-primary" onClick={() => go(2)}>계속</button></div>
      </>}
      {step === 2 && <>
        <div className="onboarding-heading"><h1 ref={heading} tabIndex={-1}>나만의 dot 꾸미기</h1><p>모양과 표정으로 개성을 더해 보세요.</p></div>
        <IdentityEditor profile={profile} onSave={value => go(3, value)} onboarding />
      </>}
      {step === 3 && <>
        <div className="connection-orbit" aria-hidden="true"><DotAvatar profile={{ ...profile, avatar: 'ring' }} size={90} />{['gmail', 'calendar', 'drive', 'slack'].map(id => <span key={id}><ServiceLogo service={id} size={28} /></span>)}</div>
        <div className="onboarding-heading"><h1 ref={heading} tabIndex={-1}>dot을 더 유용하게</h1><p>앱을 연결하면 dot이 필요한 자료를 찾고<br />더 많은 일을 도와줄 수 있어요.</p></div>
        <div className="onboarding-card"><div className="onboarding-card-rows">{plugins.map(plugin => { const connection = connections.find(row => row.id === plugin.id); return <div className="connection-row" key={plugin.id}><span className="connection-mark">{['gmail', 'calendar', 'drive'].includes(plugin.id) ? <ServiceLogo service={plugin.id} size={26} /> : plugin.id === 'contacts' ? <Users size={22} /> : plugin.id === 'teams' ? <Mail size={22} /> : <Folder size={22} />}</span><div><strong>{plugin.title}</strong><small>{plugin.description}</small></div>{connection?.connected ? <Check size={18} aria-label="연결됨" /> : <button className="connection-link" disabled={!connection?.configured || !!connecting} title={connection ? '서비스 계정 연결' : '이 서비스는 아직 지원하지 않습니다'} onClick={() => void connect(plugin.id)}>{connecting === plugin.id ? '연결 중' : connection?.configured ? '연결' : '준비 중'}{connection?.configured && <ChevronRight size={14} />}</button>}</div>; })}</div><button className="onboarding-primary" onClick={() => go(4)}>계속</button></div>
        <button className="onboarding-secondary" onClick={() => go(4)}>추가 앱을 연결하지 않고 계속</button>
      </>}
      {step === 4 && <>
        <div className="notification-art" aria-hidden="true"><div className="notification-halo"><Bell size={64} strokeWidth={1.2} /></div><div className="notification-preview"><DotAvatar profile={{ ...profile, avatar: 'ring' }} size={36} /><span><strong>{profile.name}</strong><small>확인할 내용이 있어요.</small></span><small>지금</small></div></div>
        <div className="onboarding-heading"><h1 ref={heading} tabIndex={-1}>dot의 소식을 받아보세요</h1><p>업데이트가 있거나 내 도움이 필요할 때<br />알림을 받을 수 있도록 준비하세요.</p></div>
        <div className="onboarding-actions"><button className="onboarding-primary" onClick={async () => { if (notification === 'default') { try { const result = await Notification.requestPermission(); setNotification(result); if (result !== 'granted') { setError('알림이 허용되지 않았어요. 나중에 설정에서 변경할 수 있습니다.'); return; } } catch { setError('이 환경에서는 알림을 허용할 수 없어요. 나중에 설정할 수 있습니다.'); return; } } go(5); }}>{notification === 'default' ? '알림 켜기' : '계속'}</button><button className="onboarding-secondary" onClick={() => go(5)}>나중에</button></div>
      </>}
      {step === 5 && <>
        <div className="onboarding-arrival"><DotAvatar profile={{ ...profile, avatar: 'ring' }} size={128} /></div>
        <div className="onboarding-heading"><h1 ref={heading} tabIndex={-1}>{profile.name}와 만나보세요</h1><p>이제 대화를 시작할 수 있어요.<br />무엇부터 함께 해볼까요?</p></div>
        <button className="onboarding-primary" onClick={() => onFinish(profile)}>dot과 대화하기</button>
        {!computer.connected && <p className="onboarding-footnote">컴퓨터는 연결되는 대로 사용할 수 있습니다.</p>}
      </>}
      {error && <p className="settings-error" role="alert">{error}</p>}
    </div></div>
    {step === 0 && <footer className="onboarding-footer">OhMyDots · 내 컴퓨터 에이전트</footer>}
  </section>;
}
