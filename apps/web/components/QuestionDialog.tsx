'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, Check, Loader2, MessageCircle, X } from 'lucide-react';
import Markdown from 'react-markdown';
import { api, post, type Activity } from '../lib/api';

export default function QuestionDialog({ runId, question, onDismiss, onAnswered }: {
  runId: string; question: Activity; onDismiss: () => void; onAnswered: () => void;
}) {
  const options = Array.isArray(question.payload.options) ? question.payload.options.filter((o): o is string => typeof o === 'string') : [];
  const recommended = typeof question.payload.recommended_index === 'number' ? question.payload.recommended_index : -1;
  const [selected, setSelected] = useState(recommended >= 0 && recommended < options.length ? recommended : -1);
  const [custom, setCustom] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const titleId = useId();
  const fieldId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  const answer = selected === -1 ? custom.trim() : options[selected];
  const submit = async () => {
    if (!answer || submitting.current) return;
    submitting.current = true; setSending(true); setError('');
    try {
      await api('/runs/' + runId + '/answer', post({ text: answer, question_id: question.payload.question_id }));
      onAnswered();
    } catch (e) { setError((e as Error).message); }
    finally { submitting.current = false; setSending(false); }
  };
  return <dialog ref={dialog} className="question-dialog" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); if (!sending) onDismiss(); }}>
    <header className="question-heading"><span><MessageCircle size={17} /><strong id={titleId}>답변이 필요해요</strong></span><button type="button" className="icon-button" aria-label="질문 창 닫기" disabled={sending} onClick={onDismiss}><X size={18} /></button></header>
    <form onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div className="question-scroll">
        <div className="question-body"><Markdown>{question.summary}</Markdown></div>
        <fieldset className="question-options" disabled={sending}><legend>답변 선택</legend>
          {options.map((option, index) => <label className={'question-option' + (selected === index ? ' selected' : '')} key={index}>
            <input type="radio" name="question-answer" value={index} checked={selected === index} onChange={() => setSelected(index)} />
            <span className="question-option-text">{option}{index === recommended && <span className="recommended-badge">추천</span>}</span>{selected === index && <Check size={16} aria-hidden="true" />}
          </label>)}
          <label className={'question-option' + (selected === -1 ? ' selected' : '')}><input type="radio" name="question-answer" value="custom" checked={selected === -1} onChange={() => setSelected(-1)} /><span className="question-option-text">직접 답변하기</span>{selected === -1 && <Check size={16} aria-hidden="true" />}</label>
          {selected === -1 && <><label className="question-input-label" htmlFor={fieldId}>다른 의견이나 변경할 내용을 알려 주세요</label><textarea id={fieldId} className="question-custom" rows={3} maxLength={16000} value={custom} onChange={e => setCustom(e.target.value)} placeholder="답변을 입력해 주세요" /></>}
        </fieldset>
        {error && <p className="question-error" role="alert">{error}</p>}
      </div>
      <footer className="question-footer"><small>선택 후 제출하면 작업을 이어갑니다.</small><button type="submit" className="question-submit" disabled={!answer || sending}>{sending ? <Loader2 size={15} className="spin" /> : <ArrowUp size={15} />}답변 제출</button></footer>
    </form>
  </dialog>;
}
