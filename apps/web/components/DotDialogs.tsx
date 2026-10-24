'use client';
import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { canRename, RENAME_DIALOG } from '../lib/dot-lifecycle';

function useModal(ref: { current: HTMLDialogElement | null }, onClose: () => void, busy?: boolean) {
  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    node?.showModal();
    return () => { node?.close(); previous?.focus(); };
  }, [ref]);
  // Escape must not dismiss a dialog while an action is in flight.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const cancel = (event: Event) => { if (busy) event.preventDefault(); else onClose(); };
    node.addEventListener('cancel', cancel);
    return () => node.removeEventListener('cancel', cancel);
  }, [ref, busy, onClose]);
}

export function ConfirmDialog({ title, body, confirm, cancel = '취소', danger = false, busy = false, error = '', onConfirm, onClose }: {
  title: string; body: string; confirm: string; cancel?: string; danger?: boolean; busy?: boolean; error?: string;
  onConfirm: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useModal(dialog, onClose, busy);
  return <dialog ref={dialog} className="dot-dialog" aria-label={title}>
    <header><h2>{title}</h2><button className="icon-button" aria-label="닫기" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <p>{body}</p>
    {error && <p className="settings-error" role="alert">{error}</p>}
    <footer>
      <button className="button" disabled={busy} onClick={onClose}>{cancel}</button>
      <button className={danger ? 'button danger' : 'button primary'} disabled={busy} onClick={onConfirm}>{busy && <Loader2 size={14} className="spin" />}{confirm}</button>
    </footer>
  </dialog>;
}

export function RenameDialog({ name, busy = false, error = '', onSave, onClose }: {
  name: string; busy?: boolean; error?: string; onSave: (name: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(name);
  const [local, setLocal] = useState('');
  useModal(dialog, onClose, busy);
  const submit = () => {
    if (!canRename(draft)) { setLocal(RENAME_DIALOG.rejected); return; }
    setLocal('');
    onSave(draft.trim());
  };
  return <dialog ref={dialog} className="dot-dialog" aria-label={RENAME_DIALOG.title(name)}>
    <header><h2>{RENAME_DIALOG.title(name)}</h2><button className="icon-button" aria-label="닫기" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <p>{RENAME_DIALOG.subtitle}</p>
    <label className="dot-dialog-field"><span>이름</span>
      <input autoFocus value={draft} maxLength={32} placeholder={RENAME_DIALOG.placeholder} aria-invalid={!!(local || error)}
        onChange={event => { setDraft(event.target.value); setLocal(''); }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }} />
    </label>
    {(local || error) && <p className="settings-error" role="alert">{local || error}</p>}
    <footer>
      <button className="button" disabled={busy} onClick={onClose}>{RENAME_DIALOG.cancel}</button>
      <button className="button primary" disabled={busy || !canRename(draft)} onClick={submit}>{busy && <Loader2 size={14} className="spin" />}{RENAME_DIALOG.confirm}</button>
    </footer>
  </dialog>;
}
