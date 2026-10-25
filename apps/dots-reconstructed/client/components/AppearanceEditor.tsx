import { useEffect, useRef, useState } from 'react';
import { CharacterSurface } from './Character';
import { HEROES, encodeAppearance, pngDataUrl, type CharacterHandle, type CharacterPreview } from '../lib/character';
import '../character.css';

export type AppearanceEditorProps = { preset: string; state?: string; onSave: (result: { preset: string; state: string; snapshot?: string }) => void; onClose: () => void };

export function AppearanceEditor({ preset, state, onSave, onClose }: AppearanceEditorProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const character = useRef<CharacterHandle>(null);
  const mounted = useRef(true);
  const initialized = useRef(false);
  const [preview, setPreview] = useState<CharacterPreview>();
  const [selectedPreset, setSelectedPreset] = useState(preset);
  const [tab, setTab] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current!;
    node.showModal();
    const cancel = (event: Event) => { event.preventDefault(); onCloseRef.current(); };
    node.addEventListener('cancel', cancel);
    return () => { mounted.current = false; node.removeEventListener('cancel', cancel); node.close(); previous?.focus(); };
  }, []);
  async function execute(action: string, fields: Record<string, unknown> = {}) {
    if (!character.current) throw new Error('Character is not ready.');
    const result = await character.current.command(action, fields);
    if (result.error || result.rejected) throw new Error('This appearance combination is unavailable.');
    if (result.preview && mounted.current) setPreview(result.preview);
    return result;
  }
  async function apply(action: string, fields: Record<string, unknown> = {}) {
    setBusy(true); setError('');
    try { await execute(action, fields); if (action === 'preset') setSelectedPreset(String(fields.value)); else if (['select', 'randomize', 'reset'].includes(action)) setSelectedPreset('custom'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function ready() {
    if (initialized.current) return;
    initialized.current = true;
    try {
      await execute('catalog');
      // Native renderer lazily generates actual portraits, without eight WASM instances.
      await Promise.all(HEROES.map(hero => execute('preset-thumbnail', { value: hero.id, visible: true })));
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function save() {
    setBusy(true); setError('');
    try {
      const result = await execute('snapshot');
      if (!(result.state instanceof Uint8Array) || result.state.length === 0) throw new Error('The native character did not return a saved appearance.');
      onSave({ preset: selectedPreset, state: encodeAppearance(result.state), snapshot: result.png ? pngDataUrl(result.png) : undefined });
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (mounted.current) setBusy(false); }
  }
  const preparing = preview?.preparation?.pending && !preview.preparation.background;
  return <dialog ref={dialog} className="dot-appearance-dialog" aria-labelledby="dot-appearance-heading" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <header className="dot-appearance-header"><h2 id="dot-appearance-heading">Dot 꾸미기</h2><button type="button" aria-label="꾸미기 닫기" disabled={busy} onClick={onClose}>×</button></header>
    <div className="dot-appearance-layout">
      <section className="dot-appearance-controls" aria-label="외형 설정">
        <div className="dot-appearance-tabs" role="tablist" aria-label="꾸미기 항목">
          {['캐릭터', '모양', '색상', '눈', '안경', '액세서리'].map((name, index) => <button key={name} id={`appearance-tab-${index}`} type="button" role="tab" aria-selected={tab === index - 1} aria-controls="appearance-options" tabIndex={tab === index - 1 ? 0 : -1} onClick={() => setTab(index - 1)} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const next = (index + (event.key === 'ArrowRight' ? 1 : 5)) % 6; setTab(next - 1); dialog.current?.querySelector<HTMLButtonElement>(`#appearance-tab-${next}`)?.focus(); } }}>{name}</button>)}
        </div>
        <div className="dot-appearance-options" id="appearance-options" role="tabpanel" aria-labelledby={`appearance-tab-${tab + 1}`} aria-busy={busy || !preview}>
          {!preview && <p className="dot-appearance-muted">캐릭터를 준비하고 있어요…</p>}
          {preview && tab === -1 && <div className="dot-hero-grid">{HEROES.map(hero => {
            const native = preview.presets.find(item => item.id === hero.id);
            return <button type="button" className="dot-hero-option" key={hero.id} aria-pressed={selectedPreset === hero.id} disabled={busy} onClick={() => void apply('preset', { value: hero.id })}>
              <span className="dot-hero-portrait">{native?.thumbnail ? <img src={native.thumbnail} alt="" /> : <span aria-hidden="true">{hero.title.slice(0, 1)}</span>}</span><span>{hero.title}</span>
            </button>;
          })}</div>}
          {preview && tab >= 0 && <div className="dot-catalog-grid">{(preview.catalog[tab] ?? []).map(option => <div key={option.id} className="dot-catalog-item"><button type="button" className={`dot-catalog-option ${option.color ? 'is-color' : ''}`} disabled={busy || (!option.available && !option.selected)} aria-pressed={option.selected} title={option.title} onClick={() => void apply('select', { category: tab, value: option.id })}>
            {option.thumbnail ? <img src={option.thumbnail} alt="" /> : option.color ? <span className="dot-color-swatch" style={{ backgroundColor: option.color }} /> : <span className="dot-option-symbol" aria-hidden="true">{option.title.slice(0, 2)}</span>}<span>{option.title}</span>
          </button>{option.selected && option.colors && option.colors.length > 1 && <div className="dot-accessory-colors" aria-label={`${option.title} colors`}>{option.colors.map(color => <button key={color.id} type="button" title={color.title} aria-label={`${option.title}: ${color.title}`} aria-pressed={option.colorOverride === color.id} style={{ backgroundColor: color.color }} disabled={busy} onClick={() => void apply('color', { accessory: option.id, value: color.id })} />)}</div>}</div>)}</div>}
        </div>
        <div className="dot-appearance-tools"><button type="button" disabled={busy || !preview} onClick={() => { const seed = crypto.getRandomValues(new Uint32Array(2)); void apply('randomize', { seed: (BigInt(seed[0]) << 32n) | BigInt(seed[1]) }); }}>무작위</button><button type="button" disabled={busy || !preview} onClick={() => void apply('reset')}>초기화</button><label>깊이<input type="range" min="0" max="1" step="0.05" value={preview?.depth ?? 0.5} disabled={busy || !preview} onChange={event => void apply('depth', { value: Number(event.target.value) })} /></label></div>
      </section>
      <section className="dot-appearance-preview" aria-label="움직이는 캐릭터 미리보기"><CharacterSurface ref={character} preset={preset} state={state} mode="editor" onReady={() => void ready()} onPreview={setPreview} /><p>드래그해 돌리기 · 눌러서 인사하기</p></section>
    </div>
    {error && <p className="dot-appearance-error" role="alert">{error}</p>}
    <footer className="dot-appearance-footer"><button type="button" disabled={busy} onClick={onClose}>취소</button><button type="button" className="dot-appearance-save" disabled={busy || !preview || !!preparing} onClick={() => void save()}>{busy ? '준비 중…' : '저장'}</button></footer>
  </dialog>;
}
export default AppearanceEditor;
