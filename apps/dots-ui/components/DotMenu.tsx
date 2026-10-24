'use client';
import { DOT_MENU_LABELS, dotMenu, type DotMenuAction } from '../lib/dot-lifecycle';
import type { Dot } from '../lib/api';

type Props = { dot: Dot; x: number; y: number; onAction: (action: DotMenuAction) => void; onClose: () => void };

export default function DotMenu({ dot, x, y, onAction, onClose }: Props) {
  const items = dotMenu(dot);
  return (
    <div className="dot-menu" style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - 240) }} role="menu" aria-label={dot.name + ' 닷 메뉴'}>
      <div className="dot-menu-title">{dot.name}</div>
      {items.map(action => (
        <button key={action} role="menuitem" className={action === 'delete' ? 'danger' : undefined} onClick={() => onAction(action)}>
          {DOT_MENU_LABELS[action]}
        </button>
      ))}
    </div>
  );
}
