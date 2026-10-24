'use client';
import { useState } from 'react';
import { PAUSE_DIALOG, RESUME_DIALOG, REBOOT_DIALOG, DELETE_DIALOG, canRename } from '../lib/dot-lifecycle';

type ConfirmProps = { title: string; body: string; confirm: string; danger?: boolean; busy?: boolean; error?: string; onConfirm: () => void; onClose: () => void };
export function ConfirmDialog({ title, body, confirm, danger, busy, error, onConfirm, onClose }: ConfirmProps) {
  return (
    <dialog open className="dot-dialog">
      <h2>{title}</h2>
      <p>{body}</p>
      {error && <p className="settings-error">{error}</p>}
      <footer>
        <button className="button light" disabled={busy} onClick={onClose}>취소</button>
        <button className={'button ' + (danger ? 'danger' : '')} disabled={busy} onClick={onConfirm}>{busy ? '처리 중…' : confirm}</button>
      </footer>
    </dialog>
  );
}

type RenameProps = { name: string; busy?: boolean; error?: string; onSave: (name: string) => void; onClose: () => void };
export function RenameDialog({ name, busy, error, onSave, onClose }: RenameProps) {
  const [value, setValue] = useState(name);
  const valid = canRename(value);
  return (
    <dialog open className="dot-dialog">
      <h2>{name} 이름 바꾸기</h2>
      <p>짧고 알아보기 쉽게 지어 주세요.</p>
      <input value={value} onChange={e => setValue(e.target.value)} placeholder="이름 추가…" />
      {error && <p className="settings-error">{error}</p>}
      <footer>
        <button className="button light" disabled={busy} onClick={onClose}>취소</button>
        <button className="button" disabled={busy || !valid} onClick={() => onSave(value.trim())}>{busy ? '저장 중…' : '저장'}</button>
      </footer>
    </dialog>
  );
}

export const dialogProps = {
  pause: (name: string) => ({ title: PAUSE_DIALOG.title(name), body: PAUSE_DIALOG.body, confirm: PAUSE_DIALOG.confirm }),
  resume: (name: string) => ({ title: RESUME_DIALOG.title(name), body: RESUME_DIALOG.body, confirm: RESUME_DIALOG.confirm }),
  reboot: (name: string) => ({ title: REBOOT_DIALOG.title(name), body: REBOOT_DIALOG.body, confirm: REBOOT_DIALOG.confirm }),
  delete: (name: string) => ({ title: DELETE_DIALOG.title(name), body: DELETE_DIALOG.body, confirm: DELETE_DIALOG.confirm, danger: true }),
};
