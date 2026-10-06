'use client';
import { ArrowLeft, Bot, Check, ChevronRight, FileText, Globe, KeyRound, Laptop, Monitor } from 'lucide-react';
import { DotAvatar, IdentityEditor } from './DotIdentity';
import type { DotProfile } from '../lib/dot-profile';
import type { AuthSettings, Computer } from '../lib/api';

export default function Onboarding({ profile, auth, computer, onChange, onFinish, onSettings }: { profile: DotProfile; auth: AuthSettings | null; computer: Computer; onChange: (value: DotProfile) => void; onFinish: (value: DotProfile) => void; onSettings: () => void }) {
  const step = profile.setupStep;
  return <section className={'onboarding step-' + step} aria-label="OhMyDots 시작하기">
    <header className="onboarding-navigation"><button className="icon-button" aria-label="이전 단계" disabled={step === 0} onClick={() => onChange({ ...profile, setupStep: step - 1 })}><ArrowLeft size={19} /></button><span>{step + 1} / 3</span><button className="onboarding-skip" onClick={() => onFinish(profile)}>나중에 설정</button></header>
    <div className="onboarding-content" key={step}>
      {step === 0 && <><div className="connection-orbit" aria-hidden="true"><DotAvatar profile={profile} size={96} /><span><FileText size={21} /></span><span><Globe size={23} /></span><span><Bot size={22} /></span><span><KeyRound size={21} /></span></div><h1>당신의 dot을 더 유용하게</h1><p className="onboarding-description">AI를 연결하고, 컴퓨터에서 함께 작업하세요.<br />연결은 언제든 설정에서 바꿀 수 있어요.</p><div className="onboarding-card">{[
        { icon: Bot, name: 'Codex', description: 'ChatGPT 계정으로 함께 일해요.', connected: auth?.codex_connected, action: true },
        { icon: KeyRound, name: 'OpenAI API', description: '나의 API 키로 AI를 연결해요.', connected: auth?.openai_configured, action: true },
        { icon: Globe, name: 'Browser', description: 'dot의 컴퓨터에서 웹을 탐색해요.', connected: computer.connected },
        { icon: FileText, name: 'Files', description: '만든 문서와 파일을 모아 보세요.', connected: computer.connected },
      ].map(row => <div className="connection-row" key={row.name}><span className="connection-mark"><row.icon size={23} /></span><div><strong>{row.name}</strong><small>{row.description}</small></div>{row.connected ? <span className="connection-label">연결됨 <Check size={13} /></span> : row.action ? <button className="connection-link" onClick={onSettings}>{auth ? '연결하기' : '확인 중'}<ChevronRight size={13} /></button> : <span className="connection-label">연결 대기</span>}</div>)}<button className="onboarding-primary" onClick={() => onChange({ ...profile, setupStep: 1 })}>계속</button></div></>}
      {step === 1 && <><img className="onboarding-computer-art" src="/onboarding-computer.png" alt="브라우저와 앱이 있는 dot의 컴퓨터" /><h1>어디에서 함께 일할까요?</h1><p className="onboarding-description">dot에게는 자신만의 컴퓨터가 있어요.<br />작업을 지켜보고, 필요할 때 직접 조작할 수 있어요.</p><div className="onboarding-card"><div className="connection-row"><span className="connection-mark"><Monitor size={24} /></span><div><strong>내 dot의 컴퓨터</strong><small>격리된 데스크톱에서 브라우저와 파일을 사용해요.</small></div><Check size={19} /></div><div className="connection-row unavailable"><span className="connection-mark"><Laptop size={24} /></span><div><strong>내 로컬 컴퓨터</strong><small>이 기기의 앱과 파일에서 작업</small></div><span className="connection-label">준비 중</span></div><button className="onboarding-primary" onClick={() => onChange({ ...profile, setupStep: 2 })}>계속</button></div></>}
      {step === 2 && <><h1>나만의 dot을 만들어 보세요</h1><p className="onboarding-description">이름과 모습을 골라 주세요. 나중에 바꿔도 좋아요.</p><IdentityEditor profile={profile} onSave={onFinish} onboarding /></>}
    </div>
  </section>;
}
