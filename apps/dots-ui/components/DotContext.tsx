'use client';
import { Monitor, Phone, History, Folder, Settings2, PanelRightOpen, Pin } from 'lucide-react';
import { DotAvatar } from './DotAvatar';
import { CALL_UNAVAILABLE, PIP_CONTROLS, relativeTime, type DotStatus } from '../lib/dot-lifecycle';
import type { Dot } from '../lib/api';

type Props = {
  dot: Dot | null;
  onMenu: (x: number, y: number) => void;
  onComputer: () => void;
  onPip: () => void;
  onSettings: () => void;
};

function statusBadge(status: DotStatus) {
  if (status === 'PAUSED') return '일시 중지됨';
  if (status === 'ARCHIVED') return '보관됨';
  return '활성';
}

export default function DotContext({ dot, onMenu, onComputer, onPip, onSettings }: Props) {
  if (!dot) return null;
  return (
    <aside className="dot-context">
      <header className="dot-context-header">
        <span>{dot.name}</span>
        <div>
          <button className="icon-button" aria-label="Dot 메뉴" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onMenu(r.left, r.bottom); }}><Settings2 size={18} /></button>
          <button className="icon-button" aria-label="정보 패널 닫기" onClick={onSettings}><PanelRightOpen size={18} /></button>
        </div>
      </header>
      <div className="dot-context-avatar">
        <DotAvatar profile={dot} size={64} />
        <div>
          <strong>{dot.name}</strong>
          <p>{statusBadge(dot.status)} · 마지막 활동 {relativeTime(dot.last_active_at)}</p>
        </div>
      </div>
      <div className="dot-context-section">
        <button className="dot-context-call" disabled><Phone size={16} /> 통화하기</button>
        <p className="settings-help" style={{ marginTop: 4 }}>{CALL_UNAVAILABLE}</p>
      </div>
      <div className="dot-context-section">
        <h3>컴퓨터</h3>
        <div className="dot-context-row"><button className="button light" onClick={onComputer}><Monitor size={16} />{dot.name}의 컴퓨터</button></div>
        <div className="dot-context-row"><button className="button light" onClick={onPip}><Monitor size={16} />{PIP_CONTROLS.sendToDot}</button></div>
      </div>
      <div className="dot-context-section">
        <h3>활동</h3>
        <p className="settings-help">최근 활동이 여기에 표시됩니다.</p>
        <button className="button light" onClick={() => {}}><History size={16} />활동 모두 보기</button>
      </div>
      <div className="dot-context-section">
        <h3>결과물</h3>
        <p className="settings-help">이 Dot에서 만든 파일이 여기에 표시됩니다.</p>
        <button className="button light" onClick={() => {}}><Folder size={16} />컴퓨터에서 파일 열기</button>
      </div>
    </aside>
  );
}
