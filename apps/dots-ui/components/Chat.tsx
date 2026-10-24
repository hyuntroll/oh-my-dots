'use client';
import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowUp } from 'lucide-react';
import { api, post, type Conversation, type Message, type Run } from '../lib/api';

function runForMessage(runs: Run[] | undefined, runId: string | null) {
  if (!runId || !runs) return null;
  return runs.find(r => r.id === runId) || null;
}

function formatTime(ts?: number | null) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export default function Chat({ dotId, dotName }: { dotId: string; dotName: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const currentId = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    const id = currentId.current;
    if (!id) return;
    try {
      const row = await api<Conversation>('/conversations/' + id);
      if (currentId.current === id) setConversation(row);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const key = 'dot-conversation:' + dotId;
    let stale = false;
    const init = async () => {
      currentId.current = null;
      setConversation(null);
      try {
        const list = await api<Conversation[]>('/conversations?dot_id=' + encodeURIComponent(dotId));
        if (stale) return;
        setConversations(list);
        const remembered = localStorage.getItem(key);
        let chosen = list.find(c => c.id === remembered) || list[0];
        if (!chosen) chosen = await api<Conversation>('/conversations', post({ dot_id: dotId }));
        if (stale) return;
        currentId.current = chosen.id;
        localStorage.setItem(key, chosen.id);
        setConversation(chosen);
      } catch (e) { if (!stale) setError((e as Error).message); }
    };
    void init();
    const poll = setInterval(() => { refresh().catch(() => {}); }, 2000);
    return () => { stale = true; clearInterval(poll); };
  }, [dotId]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversation?.messages]);

  const submit = async () => {
    const prompt = text.trim();
    if (!prompt || !conversation || submitting) return;
    setSubmitting(true); setError('');
    try {
      await api('/conversations/' + conversation.id + '/messages', post({ text: prompt, dot_name: dotName, idempotency_key: crypto.randomUUID() }));
      setText('');
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <>
      <section className="dots-chat">
        {error && <p className="settings-error" style={{ textAlign: 'center' }}>{error}</p>}
        {!conversation ? <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 80 }}>대화를 불러오는 중…</p> :
          conversation.messages?.length ? conversation.messages.map((message: Message) => (
            <article key={message.sequence} className={'chat-message ' + message.role}>
              <div className="chat-bubble">{message.text}</div>
              <span className="chat-time">{formatTime(message.sequence)}</span>
              {message.role === 'user' && (() => {
                const run = runForMessage(conversation.runs, message.run_id);
                if (!run || run.status === 'COMPLETED') return null;
                return <div className="chat-run-status"><span>{run.status === 'RUNNING' ? <Loader2 size={11} className="spin" /> : null}{run.status}</span></div>;
              })()}
            </article>
          )) : <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 80 }}>새로운 대화를 시작해 보세요.</p>}
        <div ref={bottom} />
      </section>
      <div className="dots-composer">
        <div className="dots-composer-inner">
          <button className="icon-button">+</button>
          <textarea
            rows={1}
            placeholder="메시지 본내기"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }}
          />
          <button className="send icon-button" disabled={!text.trim() || submitting || !conversation} onClick={() => void submit()}>
            {submitting ? <Loader2 size={14} className="spin" /> : <ArrowUp size={15} />}
          </button>
        </div>
      </div>
    </>
  );
}
