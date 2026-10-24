'use client';
import { useEffect, useRef, useState } from 'react';
import { Home, Files, History, Settings2, SquarePen, Search, PanelLeftClose, PanelLeftOpen, ChevronDown, Plus, X, MessageSquare, MoreHorizontal, Pin } from 'lucide-react';
import { DotAvatar } from './DotIdentity';
import type { DotProfile } from '../lib/dot-profile';
import type { Dot, Conversation } from '../lib/api';

export function DotRail({ sidebarOpen, onSidebar, onHome, onFiles, onActivity, onSettings }: { sidebarOpen: boolean; onSidebar: () => void; onHome: () => void; onFiles: () => void; onActivity: () => void; onSettings: () => void }) {
  return <nav className="dot-rail" aria-label="주 메뉴">
    <button aria-label="내 dot" title="내 dot" onClick={onHome} className="rail-home"><Home size={20} /></button>
    <button aria-label="탐색 메뉴" title="탐색 메뉴" aria-expanded={sidebarOpen} onClick={onSidebar}>{sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}</button>
    <button aria-label="결과물" title="결과물" onClick={onFiles}><Files size={20} /></button>
    <button aria-label="작업 기록" title="작업 기록" onClick={onActivity}><History size={20} /></button>
    <button className="rail-settings" aria-label="설정" title="설정" onClick={onSettings}><Settings2 size={20} /></button>
  </nav>;
}

type Props = { profile: DotProfile; conversations: Conversation[]; currentId?: string; onSelect: (id: string) => void; onNew: () => void; onHome: () => void; onClose: () => void; dots: Dot[]; activeDotId: string; onDot: (id: string) => void; onDotMenu: (dot: Dot, x: number, y: number) => void; onAddDot: () => void; onFiles: () => void; onActivity: () => void; onSettings: () => void };
export default function DotSidebar({ profile, conversations, currentId, onSelect, onNew, onHome, onClose, dots, activeDotId, onDot, onDotMenu, onAddDot, onFiles, onActivity, onSettings }: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [dotsExpanded, setDotsExpanded] = useState(true);
  const rows = conversations;
  return <aside className="dot-sidebar" aria-label="탐색">
    <header><button className="sidebar-wordmark" onClick={onHome}>OhMyDots<ChevronDown size={14} /></button><button className="icon-button" aria-label="탐색 닫기" onClick={onClose}><PanelLeftClose size={18} /></button></header>
    <div className="sidebar-primary">
      <button className="sidebar-action" onClick={onNew}><SquarePen size={18} />새 채팅</button>
      <button className="sidebar-action" onClick={() => setSearchOpen(!searchOpen)} aria-expanded={searchOpen}><Search size={18} />채팅 검색</button>
      <button className="sidebar-action" onClick={onFiles}><Files size={18} />스페이스</button>
      <button className="sidebar-action" onClick={onActivity}><History size={18} />활동</button>
    </div>
    {searchOpen && <ChatSearch conversations={conversations} onClose={() => setSearchOpen(false)} onSelect={id => { onSelect(id); setSearchOpen(false); }} onNew={() => { onNew(); setSearchOpen(false); }} />}
    <section className="sidebar-dot-section" aria-label="Dots">
      <div className="sidebar-section-title"><button aria-expanded={dotsExpanded} onClick={() => setDotsExpanded(!dotsExpanded)}>내 dot<ChevronDown size={12} className={dotsExpanded ? '' : 'collapsed'} /></button><button className="icon-button" aria-label="Dot 추가" title="Dot 추가" onClick={onAddDot}><Plus size={15} /></button></div>
      {dotsExpanded && <nav className="sidebar-dot-list" aria-label="내 Dots">{dots.map(dot => <div className="sidebar-dot-row" key={dot.id}>
        <button aria-current={activeDotId === dot.id ? 'page' : undefined} onClick={() => onDot(dot.id)} onContextMenu={event => { event.preventDefault(); onDotMenu(dot, event.clientX, event.clientY); }}>
          <DotAvatar profile={dot} size={28} />
          <span>{dot.name}{dot.status === 'PAUSED' && <small>일시 중지됨</small>}</span>
          {dot.pinned && <Pin size={12} className="dot-pin" aria-label="고정됨" />}
        </button>
        <button className="icon-button sidebar-dot-menu" data-dot-menu-trigger aria-label={dot.name + ' 메뉴'} aria-haspopup="menu" title="Dot 메뉴"
          onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); onDotMenu(dot, rect.left, rect.bottom); }}><MoreHorizontal size={14} /></button>
      </div>)}</nav>}
    </section>
    <div className="sidebar-section-title">채팅<span>{rows.length || ''}</span></div>
    <nav className="sidebar-conversations" aria-label="최근 대화">{rows.map(c => <button key={c.id} aria-current={currentId === c.id ? 'page' : undefined} onClick={() => onSelect(c.id)} title={c.title}><MessageSquare size={15} /><span>{c.title}</span></button>)}{!rows.length && <p>새 채팅으로 시작해 보세요.</p>}</nav>
    <button className="sidebar-account" onClick={onSettings} aria-label="설정"><DotAvatar profile={profile} size={30} /><span>OhMyDots<small>개인 작업 공간</small></span><Settings2 size={18} /></button>
  </aside>;
}

function ChatSearch({ conversations, onSelect, onNew, onClose }: { conversations: Conversation[]; onSelect: (id: string) => void; onNew: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const node = dialog.current; node?.showModal(); return () => { node?.close(); previous?.focus(); }; }, []);
  const results = conversations.filter(row => row.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <dialog ref={dialog} className="chat-search-dialog" aria-label="채팅 검색" onCancel={e => { e.preventDefault(); onClose(); }} onKeyDown={e => e.stopPropagation()}><header><Search size={20} /><input autoFocus aria-label="대화 검색어" placeholder="채팅 검색" value={query} onChange={e => setQuery(e.target.value)} /><button className="icon-button" aria-label="검색 닫기" onClick={onClose}><X size={20} /></button></header><div className="chat-search-results"><button className="search-new-chat" onClick={onNew}><SquarePen size={19} />새 채팅</button><p>{query ? '검색 결과' : '최근 채팅'}</p>{results.map(row => <button key={row.id} onClick={() => onSelect(row.id)}><MessageSquare size={18} /><span>{row.title}</span></button>)}{!results.length && <div className="search-empty">일치하는 채팅이 없습니다.</div>}</div><footer>Esc로 닫기</footer></dialog>;
}
