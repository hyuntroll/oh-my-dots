'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// Keep only the visual exit alive; inert removes focus and interaction immediately.
export default function Presence({ show, children, duration = 160 }: { show: boolean; children: ReactNode; duration?: number }) {
  const [mounted, setMounted] = useState(show);
  const content = useRef(children);
  if (show) content.current = children;
  useEffect(() => {
    if (show) { setMounted(true); return; }
    if ((window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reduceMotion === 'true')) { setMounted(false); return; }
    const timer = setTimeout(() => setMounted(false), duration);
    return () => clearTimeout(timer);
  }, [show, duration]);
  if (!show && !mounted) return null;
  return <div className="motion-presence" data-phase={show ? 'enter' : 'exit'} inert={!show}>{show ? children : content.current}</div>;
}
