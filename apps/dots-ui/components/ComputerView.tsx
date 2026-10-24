'use client';
import { useEffect, useState } from 'react';
import { Loader2, Maximize2, Minimize2, MonitorOff, RefreshCw } from 'lucide-react';
import { api, post, type Computer } from '../lib/api';

const sessionId = (dotId: string) => (dotId === 'dot-1' ? 'computer-1' : 'computer-' + dotId);

export default function ComputerView({ dotId, pip, onPip }: { dotId: string; pip?: boolean; onPip?: () => void }) {
  const [computer, setComputer] = useState<Computer | null>(null);
  const [screen, setScreen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sid = sessionId(dotId);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const row = await api<Computer>('/computer-sessions/' + sid);
        if (cancelled) return;
        setComputer(row);
        if (row.connected) {
          const img = await api<{ image: string }>('/computer-sessions/' + sid + '/screen');
          if (!cancelled) setScreen(img.image);
        }
      } catch (e) { if (!cancelled) setError((e as Error).message); }
    };
    refresh();
    const poll = setInterval(refresh, 2000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [sid]);

  const action = async (path: string) => {
    setBusy(true); setError('');
    try { await api('/computer-sessions/' + sid + path, post()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <section className={pip ? 'pip-stage' : 'computer-view'}>
      {!pip && <header className="computer-header"><h2>컴퓨터</h2><span className="spacer" />{onPip && <button className="icon-button" onClick={onPip}><Maximize2 size={16} /></button>}</header>}
      {error && <p className="settings-error">{error}</p>}
      {!computer ? <p className="computer-placeholder"><Loader2 size={18} className="spin" /> 상태 확인 중…</p> :
        !computer.connected ? <p className="computer-placeholder"><MonitorOff size={18} /> 컴퓨터에 연결되어 있지 않습니다.</p> :
        screen ? <img className="computer-screen" src={'data:image/jpeg;base64,' + screen} alt="Dot 컴퓨터 화면" /> :
        <p className="computer-placeholder"><Loader2 size={18} className="spin" /> 화면 불러오는 중…</p>}
      {!pip && <footer className="computer-footer">
        <button className="button light" disabled={busy} onClick={() => void action('/takeover')}>제어하기</button>
        <button className="button light" disabled={busy} onClick={() => void action('/release')}>제어 남기기</button>
        <button className="button light" disabled={busy} onClick={() => void action('/return')}>돌려주기</button>
      </footer>}
    </section>
  );
}
