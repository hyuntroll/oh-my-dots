import {useState} from 'react';
import {ArrowUpRight, Check, ChevronDown, FileText, LoaderCircle, MessageCircleQuestion, Play, ShieldCheck, Square, Terminal, X} from 'lucide-react';
import {api} from '../lib/api';
import {activeStatuses, taskLabels, type Task, type TaskItem} from '../lib/types';
export function TaskTranscript({task,onChange,compact=false}:{task:Task;onChange:()=>void;compact?:boolean}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function action(value:'cancel'|'resume') {setBusy(true);setError('');try{await api.taskAction(task.id,value);onChange();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className={`task-transcript ${compact?'is-compact':''}`} aria-label={`${task.title} 작업 기록`}>
    <header className="task-transcript-header"><span className={`status-dot status-${task.status}`}/><span>{taskLabels[task.status]}</span><span className="spacer"/>{activeStatuses.has(task.status)&&<button className="icon-button" aria-label="작업 중지" title="작업 중지" disabled={busy} onClick={()=>void action('cancel')}><Square size={14}/></button>}{['paused','interrupted','error'].includes(task.status)&&<button className="small-button" disabled={busy} onClick={()=>void action('resume')}><Play size={13}/>계속하기</button>}</header>
    {task.items.length===0&&activeStatuses.has(task.status)&&<p className="muted task-starting"><LoaderCircle size={14} className="spin"/>작업을 준비하고 있어요</p>}
    <div className="task-items">{task.items.map(item=><TranscriptItem key={item.id} item={item} task={task} onChange={onChange}/>)}</div>
    {task.error&&<div className="inline-error" role="alert">{task.error}</div>}{error&&<p className="inline-error" role="alert">{error}</p>}
  </section>;
}
function TranscriptItem({item,task,onChange}:{item:TaskItem;task:Task;onChange:()=>void}) {
  const [answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function respond(decision:'allow'|'deny') {if(busy)return;setBusy(true);setError('');try{await api.respond(item.id,decision,answer);onChange();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  if(item.type==='text')return <div className="transcript-text"><FormattedText text={item.text??''}/></div>;
  if(item.type==='artifact')return <a className="artifact-card" href={`/api/tasks/${encodeURIComponent(task.id)}/artifacts?path=${encodeURIComponent(item.path??'')}`} target="_blank" rel="noreferrer"><FileText size={20}/><span>{item.path??'파일'}<small>작업 결과물</small></span><ArrowUpRight size={15}/></a>;
  if(item.type==='tool_call')return <details className="tool-card"><summary><Terminal size={14}/><span>{toolTitle(item.name??'')}</span><span className="spacer"/>{item.status==='running'?<LoaderCircle size={13} className="spin"/>:item.status==='error'?<X size={14}/>:<Check size={14}/>}<ChevronDown size={13}/></summary><div className="tool-detail"><pre>{JSON.stringify(item.args??{},null,2)}</pre>{item.result!==undefined&&<pre>{typeof item.result==='string'?item.result:JSON.stringify(item.result,null,2)}</pre>}{item.error&&<p className="inline-error">{item.error}</p>}</div></details>;
  const question=item.type==='question',pending=item.status==='pending'&&task.status==='needs_input';
  const title=question?item.question??'답변이 필요해요':approvalTitle(item);
  return <section className={`approval-card ${pending?'is-pending':''}`} aria-label={question?'Dot 질문':'작업 승인'}><div className="approval-heading">{question?<MessageCircleQuestion size={18}/>:<ShieldCheck size={18}/>}<strong>{title}</strong></div>{item.warning&&<p className="muted">{item.warning}</p>}{!question&&<ApprovalDetails item={item} task={task}/>}{pending?<form onSubmit={event=>{event.preventDefault();void respond('allow');}}>{question&&<textarea className="form-input" aria-label="Dot에게 보낼 답변" placeholder="답변을 입력해 주세요" rows={2} value={answer} onChange={event=>setAnswer(event.target.value)} required/>}<div className="approval-actions"><button type="button" className="small-button" disabled={busy} onClick={()=>void respond('deny')}>{question?'건너뛰기':'거절'}</button><button className="small-button primary" disabled={busy||question&&!answer.trim()}>{busy?'처리 중…':question?'답변 보내기':'허용'}</button></div></form>:<p className="approval-result">{item.decision==='allow'?question?`답변: ${item.value??''}`:'허용했어요':item.decision==='deny'?'진행하지 않았어요':'이 작업에서 더 이상 응답을 기다리지 않아요'}</p>}{error&&<p className="inline-error" role="alert">{error}</p>}</section>;
}
function ApprovalDetails({item,task}:{item:TaskItem;task:Task}) {
  if(item.kind==='write')return <div className="approval-review"><span className="approval-review-label">저장할 파일</span><pre>{item.path??'경로 없음'}</pre><span className="approval-review-label">파일 내용</span><pre aria-label="저장할 파일의 전체 내용">{item.content??''}</pre></div>;
  if(item.kind==='computer'){
    const index=task.items.findIndex(entry=>entry.id===item.id);
    const preceding=task.items.slice(0,index).reverse().find(entry=>entry.type==='tool_call'&&entry.name?.replace(/^dots_/,'')==='computer_action'&&(!item.action||entry.args?.action===item.action));
    const metadata=new Set(['id','type','kind','status','created_at','decision','value','warning','display_name']);
    const topLevel=Object.fromEntries(Object.entries(item).filter(([key,value])=>!metadata.has(key)&&value!==undefined));
    const args=item.args??preceding?.args??topLevel;
    return <div className="approval-review"><span className="approval-review-label">컴퓨터에서 실행할 작업</span><pre aria-label="컴퓨터 작업의 전체 입력">{JSON.stringify(args,null,2)}</pre></div>;
  }
  return <pre>{item.command??item.text??item.path??JSON.stringify(item.args??{},null,2)}</pre>;
}
function approvalTitle(item:TaskItem){switch(item.kind){case'shell':return'이 명령을 실행할까요?';case'write':return'파일을 저장할까요?';case'peer_message':return`${item.display_name??'다른 Dot'}에게 메시지를 보낼까요?`;case'computer':return'컴퓨터에서 이 작업을 할까요?';default:return'작업을 계속할까요?';}}
export function toolTitle(name:string){const clean=name.replace(/^dots_/,'');return ({read_file:'파일 읽기',list_files:'파일 확인',write_file:'파일 만들기',shell:'명령 실행',ask_user:'답변 기다리는 중',send_message:'다른 Dot에게 메시지 보내기',computer_screenshot:'컴퓨터 화면 확인',computer_status:'컴퓨터 연결 상태 확인',computer_action:'컴퓨터 사용'} as Record<string,string>)[clean]??clean;}

/** Small safe presentation layer: model output is always React text, never HTML. */
export function FormattedText({text}:{text:string}) {
 const blocks=text.split(/(```[\s\S]*?```)/g);
 return <>{blocks.map((block,index)=>{
  if(block.startsWith('```')){const body=block.slice(3,-3),newline=body.indexOf('\n');return <div className="message-code" key={index}>{newline>=0&&<div>{body.slice(0,newline).trim()||'코드'}</div>}<pre><code>{newline>=0?body.slice(newline+1):body}</code></pre></div>;}
  return <span className="message-prose" key={index}>{block.split('\n').map((line,row)=>{const heading=/^(#{1,3})\s+(.+)$/.exec(line);return <span className={heading?'message-heading':/^[-*]\s+/.test(line)?'message-list-line':''} key={row}>{inlineText(heading?heading[2]:line)}{row<block.split('\n').length-1?'\n':null}</span>;})}</span>;
 })}</>;
}
function inlineText(text:string){return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part,index)=>{if(part.startsWith('**')&&part.endsWith('**'))return <strong key={index}>{part.slice(2,-2)}</strong>;if(part.startsWith('`')&&part.endsWith('`'))return <code key={index}>{part.slice(1,-1)}</code>;const link=/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);if(link)return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;return part;});}
