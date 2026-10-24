'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Shuffle, X } from 'lucide-react';
import { DOT_COLORS, type DotProfile } from '../lib/dot-profile';
import DotCharacter, { portraits, portraitKey, type CharacterHandle, type CharacterPreview, type CharacterOption } from './DotCharacter';
import { encodeBytes, reduceMotion, type DotActivity } from '../lib/dot-motion';

export function DotAvatar({ profile, size = 40, activity = 'Ready', turnId, animated = size >= 40 }: { profile: Pick<DotProfile, 'avatar' | 'color' | 'characterState' | 'characterImage'>; size?: number; activity?: DotActivity; turnId?: string; animated?: boolean }) {
  const preset = profile.avatar === 'ring' || profile.avatar === 'pet' ? 'alfred' : profile.avatar;
  const key = portraitKey(profile.characterState, preset);
  const [portrait, setPortrait] = useState<string>();
  useEffect(() => { const update = () => setPortrait(portraits.get(key)); update(); window.addEventListener('dot-portrait', update); return () => window.removeEventListener('dot-portrait', update); }, [key]);
  return <span className="dot-avatar" style={{ width: size, height: size }} data-character-artwork>
    <img src={profile.characterImage || portrait || `/reference-dot/${profile.color}.svg`} width={size} height={size} alt="" aria-hidden="true" />
    {animated && <DotCharacter state={profile.characterState} preset={preset} activity={activity} turnId={turnId} />}
  </span>;
}

type ThumbnailIndex = { aliases: Record<string, string>; entries: Record<string, [number, number, number][] | null>; files: [string, number, number][] };
function OptionArtwork({ option, category, shape, theme, index }: { option: CharacterOption; category: number; shape: string; theme: string; index: ThumbnailIndex | null }) {
  const categoryName = ['', '', 'eyes', 'eyewear', 'accessory'][category];
  const canonical = index?.aliases[shape] || shape;
  const layers = index?.entries[`${canonical}/${categoryName}/${option.id}/${theme}`];
  if (layers && index) return <span className="character-option-art" aria-hidden="true">{layers.map(([file, x, y], i) => { const [hash, w, h] = index.files[file]; return <img key={i} src={`/dot-engine/runtime/orbit-thumbnails/images/${hash}.png`} alt="" style={{ left: `${x / 384 * 100}%`, top: `${y / 384 * 100}%`, width: `${w / 384 * 100}%`, height: `${h / 384 * 100}%` }} />; })}</span>;
  if (option.thumbnail) return <img className="character-shape-art" src={option.thumbnail} alt="" />;
  return <span className="character-option-name">{option.title}</span>;
}
export function IdentityEditor({ profile, onSave, onboarding = false, busy = false }: { profile: DotProfile; onSave: (value: DotProfile) => void; onboarding?: boolean; busy?: boolean }) {
  const [draft, setDraft] = useState(profile);
  const [preview, setPreview] = useState<CharacterPreview | null>(null);
  const [category, setCategory] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [index, setIndex] = useState<ThumbnailIndex | null>(null);
  const engine = useRef<CharacterHandle>(null);
  const ready = useRef(false);
  useEffect(() => { const controller = new AbortController(); fetch('/dot-engine/runtime/orbit-thumbnails/index.json', { signal: controller.signal }).then(r => r.json()).then(setIndex).catch(() => {}); return () => controller.abort(); }, []);
  const command = async (action: string, fields = {}) => {
    setError(''); setEditing(true);
    try { const reply = await engine.current!.command(action, fields); if (reply.error || reply.rejected) throw new Error('선택한 모습을 적용하지 못했어요.'); }
    catch (e) { setError((e as Error).message); }
    finally { setEditing(false); }
  };
  const load = () => { if (ready.current) return; ready.current = true; void command('catalog', { thumbnails: false }); };
  const save = async () => {
    if (!draft.name.trim() || busy || saving) return;
    setSaving(true); setError('');
    try {
      const snapshot = await engine.current!.command('snapshot');
      if (snapshot.error || !snapshot.state || !snapshot.png) throw new Error('미리보기를 저장하지 못했어요. 다시 시도해 주세요.');
      onSave({ ...draft, avatar: 'ring', name: draft.name.trim(), characterState: encodeBytes(snapshot.state), characterImage: 'data:image/png;base64,' + encodeBytes(snapshot.png) });
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const locked = busy || saving || editing;
  const shape = preview?.catalog[0].find(o => o.selected)?.id || 'circle';
  return <form className="identity-editor" onSubmit={e => { e.preventDefault(); void save(); }}>
    <div className="identity-controls">
      <div className="character-tabs" role="tablist" aria-label="꾸미기 종류">{['모양', '눈', '안경', '액세서리'].map((label, i) => <button type="button" key={label} role="tab" aria-selected={category === [0, 2, 3, 4][i]} onClick={() => setCategory([0, 2, 3, 4][i])}>{label}</button>)}</div>
      <div className="character-options" role="tabpanel" aria-label="캐릭터 선택">{preview ? preview.catalog[category].map(option => <button key={option.id} type="button" title={option.title} aria-label={option.title} aria-pressed={option.selected} disabled={locked || !option.available} onClick={() => void command('select', { category, value: option.id })}><OptionArtwork option={option} category={category} shape={shape} theme={profile.theme} index={index} />{option.selected && <span className="avatar-selected"><Check size={12} /></span>}</button>) : <div className="character-loading">캐릭터를 준비하고 있어요…</div>}</div>
      <div className="character-colors" aria-label="색상">{preview?.catalog[1].map(color => <button type="button" key={color.id} title={color.title} aria-label={color.title} aria-pressed={color.selected} disabled={locked || !color.available} style={{ '--swatch': color.color } as CSSProperties} onClick={() => { const match = DOT_COLORS.find(c => c.value.toLowerCase() === color.color?.toLowerCase()); if (match) setDraft(v => ({ ...v, color: match.id })); void command('select', { category: 1, value: color.id }); }}>{color.selected && <Check size={13} />}</button>)}</div>
    </div>
    <div className="identity-preview">
      <label className="identity-name">닉네임<input aria-label="Dot 이름" value={draft.name} maxLength={24} autoComplete="off" disabled={locked} onChange={e => setDraft({ ...draft, name: e.target.value.replace(/[\r\n\\]/g, '') })} /></label>
      <div className="identity-avatar" data-character-destination><DotCharacter ref={engine} state={profile.characterState} preset={profile.avatar === 'ring' || profile.avatar === 'pet' ? 'alfred' : profile.avatar} mode="editor" onPreview={setPreview} onReady={load} /></div>
      <button className="character-react" type="button" disabled={!preview || locked} onClick={() => void command('reaction')}>인사하기</button>
      <div className="identity-footer"><button className="onboarding-primary" disabled={locked || !preview || !draft.name.trim()}>{saving || busy ? '저장 중…' : onboarding ? '계속' : '저장'}</button><button type="button" className="identity-randomize" disabled={locked || !preview} onClick={() => void command('randomize', { seed: BigInt(crypto.getRandomValues(new Uint32Array(1))[0]) })}><Shuffle size={16} />랜덤으로 선택</button></div>
      {error && <p className="settings-error" role="alert">{error}</p>}
    </div>
  </form>;
}

export default function CustomizeDot({ profile, onSave, onClose, title = '나만의 dot 꾸미기', busy = false }: { profile: DotProfile; onSave: (value: DotProfile) => void; onClose: () => void; title?: string; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const source = useRef<HTMLElement | null>(null);
  const previous = useRef<HTMLElement | null>(null);
  const fly = (reverse = false, image?: string) => {
    const from = source.current;
    const to = dialog.current?.querySelector<HTMLElement>('[data-character-destination]');
    if (!from || !to || reduceMotion()) return;
    const sourceRect = from.getBoundingClientRect(), targetRect = to.getBoundingClientRect();
    const modal = dialog.current!, bounds = modal.getBoundingClientRect();
    const scale = bounds.width / modal.offsetWidth;
    const target = { left: bounds.left + bounds.width / 2 + (targetRect.left - bounds.left - bounds.width / 2) / scale, top: bounds.top + bounds.height / 2 + (targetRect.top - bounds.top - bounds.height / 2) / scale, width: targetRect.width / scale, height: targetRect.height / scale };
    const a = reverse ? target : sourceRect, b = reverse ? sourceRect : target;
    if (!a.width || !b.width) return;
    const snapshot = from.querySelector('img')?.cloneNode(true) as HTMLImageElement | undefined;
    if (!snapshot) return;
    if (image) snapshot.src = image;
    snapshot.className = 'character-flight'; Object.assign(snapshot.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    dialog.current?.append(snapshot);
    const animation = snapshot.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${b.left - a.left}px,${b.top - a.top}px) scale(${b.width / a.width},${b.height / a.height})`, opacity: reverse ? 1 : 0 }], { duration: 300, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'both' });
    void animation.finished.finally(() => snapshot.remove());
  };
  useEffect(() => {
    previous.current = document.activeElement as HTMLElement | null;
    source.current = previous.current?.querySelector('[data-character-artwork]') || document.querySelector('.context-avatar [data-character-artwork]') || document.querySelector('.profile-trigger [data-character-artwork]');
    const node = dialog.current; node?.showModal();
    const frame = requestAnimationFrame(() => fly());
    return () => { cancelAnimationFrame(frame); node?.close(); previous.current?.focus({ preventScroll: true }); };
  }, []);
  const close = (saved?: DotProfile) => { if (closing || busy) return; setClosing(true); fly(true, saved?.characterImage); setTimeout(() => { if (saved) onSave(saved); else onClose(); }, reduceMotion() ? 0 : 300); };
  return <dialog ref={dialog} className="customize-dialog" data-closing={closing} aria-labelledby="customize-heading" onCancel={e => { e.preventDefault(); close(); }}><header><h2 id="customize-heading">{title}</h2><button className="icon-button" aria-label="꾸미기 닫기" disabled={busy || closing} onClick={() => close()}><X size={20} /></button></header><IdentityEditor profile={profile} onSave={value => close(value)} busy={busy || closing} /></dialog>;
}
