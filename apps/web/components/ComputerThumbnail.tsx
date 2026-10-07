'use client';
import { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';

export default function ComputerThumbnail({ sessionId, name }: { sessionId: string; name: string }) {
  const [image, setImage] = useState<string>();
  useEffect(() => {
    let disposed = false;
    let current: string | undefined;
    let fetching = false;
    const controller = new AbortController();
    const capture = async () => {
      if (document.hidden || fetching) return;
      fetching = true;
      try {
        const response = await fetch(`/api/computer-sessions/${encodeURIComponent(sessionId)}/screen`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const blob = await response.blob();
        if (disposed) return;
        const next = URL.createObjectURL(blob);
        const previous = current;
        current = next; setImage(next);
        if (previous) URL.revokeObjectURL(previous);
      } catch { /* Keep the last successful preview during a reconnect. */ }
      finally { fetching = false; }
    };
    void capture();
    const timer = setInterval(() => { void capture(); }, 300_000);
    const visible = () => { if (!document.hidden) void capture(); };
    document.addEventListener('visibilitychange', visible);
    return () => { disposed = true; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); if (current) URL.revokeObjectURL(current); };
  }, [sessionId]);
  return <span className="computer-thumbnail" title="컴퓨터 화면 · 5분마다 업데이트"><Monitor size={64} strokeWidth={1.5} aria-hidden="true" />{image && <img src={image} alt={`${name} 컴퓨터 미리보기`} />}</span>;
}
