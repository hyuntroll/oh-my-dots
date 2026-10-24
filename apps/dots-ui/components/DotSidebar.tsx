'use client';
import { Home, Files, History, Settings2, Plus, MoreHorizontal, Pin } from 'lucide-react';
import { DotAvatar } from './DotAvatar';
import type { Dot } from '../lib/api';
import type { DotProfile } from '../lib/dot-profile';

type Props = {
  profile: DotProfile;
  dots: Dot[];
  activeDotId: string;
  onDot: (id: string) => void;
  onDotMenu: (dot: Dot, x: number, y: number) => void;
  onAddDot: () => void;
  onFiles: () => void;
  onActivity: () => void;
  onSettings: () => void;
};

export default function DotSidebar({ dots, activeDotId, onDot, onDotMenu, onAddDot, onFiles, onActivity, onSettings }: Props) {
  return (
    <aside className="dots-sidebar">
      <header className="dots-sidebar-header"><strong>내 Dots</strong><button className="icon-button" aria-label="Dot 추가" onClick={onAddDot}><Plus size={18} /></button></header>
      <div className="dots-sidebar-section">
        <small>내 Dot</small>
        <nav aria-label="내 Dots">
          {dots.map(dot => (
            <div className="dots-sidebar-row" key={dot.id}>
              <button aria-current={activeDotId === dot.id ? 'page' : undefined} onClick={() => onDot(dot.id)} onContextMenu={e => { e.preventDefault(); onDotMenu(dot, e.clientX, e.clientY); }}>
                <DotAvatar profile={dot} size={28} />
                <span>{dot.name}</span>
                {dot.pinned && <Pin size={12} aria-label="고정됨" />}
              </button>
              <button className="icon-button" aria-label={dot.name + ' 메뉴'} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onDotMenu(dot, r.left, r.bottom); }}><MoreHorizontal size={14} /></button>
            </div>
          ))}
        </nav>
      </div>
      <div className="dots-sidebar-section" style={{ marginTop: 'auto' }}>
        <button className="icon-button" onClick={onFiles}><Files size={18} /></button>
        <button className="icon-button" onClick={onActivity}><History size={18} /></button>
        <button className="icon-button" onClick={onSettings}><Settings2 size={18} /></button>
      </div>
    </aside>
  );
}
