'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Circle, X, Moon, Sun, Check } from 'lucide-react';
import { DOT_COLORS, DOT_CHARACTERS, type DotProfile } from '../lib/dot-profile';

export function DotAvatar({ profile, size = 40 }: { profile: Pick<DotProfile, 'avatar' | 'color'>; size?: number }) {
  const filterId = 'pet-' + useId().replaceAll(':', '');
  const accent = DOT_COLORS.find(c => c.id === profile.color)!.value;
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(accent.slice(offset, offset + 2), 16) / 255);
  const matrix = `${r} 0 ${1-r} 0 0 ${g} 0 ${1-g} 0 0 ${b} 0 ${1-b} 0 0 0 0 0 1 0`;
  const character = DOT_CHARACTERS.find(item => item.id === profile.avatar);
  if (character) return <svg className="dot-avatar dot-character" width={size} height={size} viewBox={`${character.x} ${character.y} 512 512`} aria-hidden="true"><image href="/dot-characters/characters.png" width="1536" height="1024" /></svg>;
  return profile.avatar === 'pet' ? <svg className="dot-avatar dot-pet" width={size} height={size} viewBox="210 220 840 840" aria-hidden="true"><defs><filter id={filterId} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={matrix} /></filter></defs><image href="/dot-pet.png" width="1254" height="1254" filter={`url(#${filterId})`} /></svg> : <Circle className="dot-avatar dot-ring" size={size} strokeWidth={7} color={accent} aria-hidden="true" />;
}
export function IdentityEditor({ profile, onSave, onboarding = false, busy = false }: { profile: DotProfile; onSave: (value: DotProfile) => void; onboarding?: boolean; busy?: boolean }) {
  const [draft, setDraft] = useState(profile);
  return <form className="identity-editor" onSubmit={e => { e.preventDefault(); if (draft.name.trim()) onSave({ ...draft, name: draft.name.trim() }); }}>
    <div className="identity-options">
      <fieldset><legend>Colors</legend><div className="avatar-options">{DOT_COLORS.map(color => <button key={color.id} type="button" aria-label={color.label} aria-pressed={draft.color === color.id} onClick={() => setDraft({ ...draft, color: color.id })}><DotAvatar profile={{ avatar: 'ring', color: color.id }} size={54} /></button>)}</div></fieldset>
      <fieldset><legend>캐릭터</legend><div className="avatar-options character-options"><button type="button" aria-label="기본 dot" aria-pressed={draft.avatar === 'ring'} onClick={() => setDraft({ ...draft, avatar: 'ring' })}><DotAvatar profile={{ ...draft, avatar: 'ring' }} size={60} /><small>기본 dot</small></button><button type="button" aria-label="OhMyDots 캐릭터" aria-pressed={draft.avatar === 'pet'} onClick={() => setDraft({ ...draft, avatar: 'pet' })}><DotAvatar profile={{ ...draft, avatar: 'pet' }} size={60} /><small>OhMyDots</small></button>{DOT_CHARACTERS.map(character => <button key={character.id} type="button" aria-label={character.name} title={character.description} aria-pressed={draft.avatar === character.id} onClick={() => setDraft({ ...draft, avatar: character.id, color: character.color })}><DotAvatar profile={{ ...draft, avatar: character.id }} size={60} /><small>{character.name}</small></button>)}</div><p className="character-help">캐릭터는 원래 색상을 유지하고, 위 색상은 컴퓨터 테마에도 적용돼요.</p></fieldset>
      <fieldset><legend>화면</legend><div className="theme-options">{(['dark', 'light'] as const).map(theme => <button type="button" key={theme} aria-pressed={draft.theme === theme} onClick={() => setDraft({ ...draft, theme })}>{theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}{theme === 'dark' ? '다크' : '라이트'}{draft.theme === theme && <Check size={14} />}</button>)}</div></fieldset>
    </div>
    <div className="identity-preview"><label><span className="sr-only">Dot 이름</span><input aria-label="Dot 이름" value={draft.name} maxLength={32} autoComplete="off" placeholder="이름을 지어 주세요" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><div className="identity-avatar"><DotAvatar profile={draft} size={126} /></div><button className="onboarding-primary" disabled={busy || !draft.name.trim()}>{busy ? '컴퓨터 준비 중…' : onboarding ? '대화 시작하기' : '저장'}</button><small>Dot마다 이름과 모습, 컴퓨터를 따로 저장합니다.</small></div>
  </form>;
}
export default function CustomizeDot({ profile, onSave, onClose, title = "Customize your dot", busy = false }: { profile: DotProfile; onSave: (value: DotProfile) => void; onClose: () => void; title?: string; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const node = dialog.current; node?.showModal(); return () => { node?.close(); previous?.focus(); }; }, []);
  return <dialog ref={dialog} className="customize-dialog" aria-labelledby="customize-heading" onCancel={e => { e.preventDefault(); onClose(); }}><header><h2 id="customize-heading">{title}</h2><button className="icon-button" aria-label="꾸미기 닫기" onClick={onClose}><X size={20} /></button></header><IdentityEditor profile={profile} onSave={onSave} busy={busy} /></dialog>;
}
