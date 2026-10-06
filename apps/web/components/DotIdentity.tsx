'use client';
import { useEffect, useRef, useState } from 'react';
import { Circle, X, Moon, Sun, Check } from 'lucide-react';
import { DOT_COLORS, type DotProfile } from '../lib/dot-profile';

export function DotAvatar({ profile, size = 40 }: { profile: Pick<DotProfile, 'avatar' | 'color'>; size?: number }) {
  return profile.avatar === 'pet' ? <img className="dot-avatar" src="/dot-pet.png" width={size} height={size} alt="" /> : <Circle className="dot-avatar dot-ring" size={size} strokeWidth={7} color={DOT_COLORS.find(c => c.id === profile.color)?.value} aria-hidden="true" />;
}
export function IdentityEditor({ profile, onSave, onboarding = false }: { profile: DotProfile; onSave: (value: DotProfile) => void; onboarding?: boolean }) {
  const [draft, setDraft] = useState(profile);
  return <form className="identity-editor" onSubmit={e => { e.preventDefault(); if (draft.name.trim()) onSave({ ...draft, name: draft.name.trim() }); }}>
    <div className="identity-options">
      <fieldset><legend>Colors</legend><div className="avatar-options">{DOT_COLORS.map(color => <button key={color.id} type="button" aria-label={color.label} aria-pressed={draft.color === color.id && draft.avatar === 'ring'} onClick={() => setDraft({ ...draft, color: color.id, avatar: 'ring' })}><DotAvatar profile={{ avatar: 'ring', color: color.id }} size={54} /></button>)}</div></fieldset>
      <fieldset><legend>캐릭터</legend><div className="avatar-options"><button type="button" aria-label="OhMyDots 캐릭터" aria-pressed={draft.avatar === 'pet'} onClick={() => setDraft({ ...draft, avatar: 'pet' })}><DotAvatar profile={{ ...draft, avatar: 'pet' }} size={66} /></button><p>익숙한 모습으로 함께해요.</p></div></fieldset>
      <fieldset><legend>화면</legend><div className="theme-options">{(['dark', 'light'] as const).map(theme => <button type="button" key={theme} aria-pressed={draft.theme === theme} onClick={() => setDraft({ ...draft, theme })}>{theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}{theme === 'dark' ? '다크' : '라이트'}{draft.theme === theme && <Check size={14} />}</button>)}</div></fieldset>
    </div>
    <div className="identity-preview"><label><span className="sr-only">Dot 이름</span><input aria-label="Dot 이름" value={draft.name} maxLength={32} autoComplete="off" placeholder="이름을 지어 주세요" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><div className="identity-avatar"><DotAvatar profile={draft} size={126} /></div><button className="onboarding-primary" disabled={!draft.name.trim()}>{onboarding ? '대화 시작하기' : '저장'}</button><small>이 브라우저에 이름과 모습을 저장합니다.</small></div>
  </form>;
}
export default function CustomizeDot({ profile, onSave, onClose }: { profile: DotProfile; onSave: (value: DotProfile) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const node = dialog.current; node?.showModal(); return () => { node?.close(); previous?.focus(); }; }, []);
  return <dialog ref={dialog} className="customize-dialog" aria-labelledby="customize-heading" onCancel={e => { e.preventDefault(); onClose(); }}><header><h2 id="customize-heading">Customize your dot</h2><button className="icon-button" aria-label="꾸미기 닫기" onClick={onClose}><X size={20} /></button></header><IdentityEditor profile={profile} onSave={onSave} /></dialog>;
}
