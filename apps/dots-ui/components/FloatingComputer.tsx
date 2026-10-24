'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Minimize2 } from 'lucide-react';
import ComputerView from './ComputerView';

export default function FloatingComputer({ dotId, onClose }: { dotId: string; onClose: () => void }) {
  const [pos, setPos] = useState({ x: 600, y: 120 });
  const [size, setSize] = useState({ w: 400, h: 260 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      setPos({ x: dragStart.current.px + e.clientX - dragStart.current.x, y: dragStart.current.py + e.clientY - dragStart.current.y });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging]);

  return (
    <div className="pip-window" style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}>
      <div className="pip-heading" onMouseDown={e => { setDragging(true); dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}>
        <MonitorIcon size={14} />
        <strong>Dot 컴퓨터</strong>
        <button className="icon-button" onClick={onClose}><X size={14} /></button>
      </div>
      <ComputerView dotId={dotId} pip />
    </div>
  );
}

function MonitorIcon(props: { size?: number }) {
  return <svg width={props.size || 16} height={props.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
}
