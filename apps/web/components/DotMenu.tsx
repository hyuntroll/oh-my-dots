'use client';
import { useEffect, useRef } from 'react';
import { Pause, Pencil, Pin, PinOff, Play, PanelRightOpen, RotateCw, Trash2 } from 'lucide-react';
import { DOT_MENU_LABELS, dotMenu, type DotMenuAction, type DotStatus } from '../lib/dot-lifecycle';

const ICONS: Record<DotMenuAction, typeof Pencil> = {
  rename: Pencil, move: PanelRightOpen, pause: Pause, resume: Play, reboot: RotateCw, pin: Pin, delete: Trash2,
};

export default function DotMenu({ dot, x, y, onAction, onClose }: {
  dot: { name: string; status: DotStatus; pinned: boolean };
  x: number; y: number;
  onAction: (action: DotMenuAction) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = menu.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + 'px';
    node.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + 'px';
    node.querySelector<HTMLButtonElement>('button')?.focus();
  }, [x, y]);
  useEffect(() => {
    const outside = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (menu.current?.contains(target as Node) || target?.closest?.('[data-dot-menu-trigger]')) return;
      onClose();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  const step = (delta: number) => {
    const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
    const index = buttons.findIndex(button => button === document.activeElement);
    buttons[(index + delta + buttons.length) % buttons.length]?.focus();
  };
  const label = (action: DotMenuAction) => action === 'pin' && dot.pinned ? '목록 고정 해제' : DOT_MENU_LABELS[action];
  return <div ref={menu} className="dot-menu" role="menu" aria-label={dot.name + ' 닷 메뉴'}
    onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); step(1); }
      if (event.key === 'ArrowUp') { event.preventDefault(); step(-1); }
    }}>
    <p className="dot-menu-title">{dot.name}{dot.status === 'PAUSED' && <span>일시 중지됨</span>}</p>
    {dotMenu(dot).map(action => {
      const Icon = action === 'pin' && dot.pinned ? PinOff : ICONS[action];
      return <button key={action} role="menuitem" className={action === 'delete' ? 'dot-menu-danger' : undefined}
        onClick={() => onAction(action)}><Icon size={16} />{label(action)}</button>;
    })}
  </div>;
}
