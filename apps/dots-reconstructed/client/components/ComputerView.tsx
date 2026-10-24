import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CircleHelp, ExternalLink, Folder, Keyboard, LoaderCircle, Monitor, MousePointer2, RefreshCw, Terminal, X } from 'lucide-react';

type Status={connected:boolean;state:string;owner:'AGENT'|'USER'|null;epoch:number|null;width:number;height:number;error?:string|null};
type Props={onClose:()=>void;profile?:{display_name?:string}|null};
const initial:Status={connected:false,state:'checking',owner:null,epoch:null,width:1280,height:960};
async function api(path:string,body?:unknown){
  const response=await fetch(`/api/computer/${path}`,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();
  if(!response.ok)throw Error(data.error?.message||data.error||'컴퓨터 요청을 처리할 수 없습니다.');
  return data;
}

export function ComputerView({onClose,profile}:Props){
  const [status,setStatus]=useState<Status>(initial),[error,setError]=useState(''),[busy,setBusy]=useState(false),[text,setText]=useState(''),[visible,setVisible]=useState(!document.hidden),[frame,setFrame]=useState(0);
  const image=useRef<HTMLImageElement>(null),current=useRef(status),keys=useRef(new Set<string>()),buttons=useRef(new Set<number>()),inputQueue=useRef(Promise.resolve());
  current.current=status;
  useEffect(()=>{
    let alive=true;let timer:ReturnType<typeof setTimeout>;
    const refresh=async()=>{try{const data=await api('status');if(alive)setStatus(data)}catch(e){if(alive)setError((e as Error).message)}finally{if(alive)timer=setTimeout(refresh,2000)}};
    void refresh();
    const visibility=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',visibility);
    return()=>{alive=false;clearTimeout(timer);document.removeEventListener('visibilitychange',visibility)};
  },[]);
  const input=useCallback(async(body:Record<string,unknown>)=>{
    const s=current.current;
    if(s.owner!=='USER'||!s.connected||s.epoch===null)return;
    const operation=inputQueue.current.then(async()=>{try{await api('input',{...body,actor:'USER',epoch:s.epoch})}catch(e){setError((e as Error).message);try{setStatus(await api('status'))}catch{}}});
    inputQueue.current=operation;
    await operation;
  },[]);
  const release=useCallback(()=>{for(const key of keys.current)void input({action:'keyup',key});keys.current.clear();for(const button of buttons.current)void input({action:'up',button});buttons.current.clear()},[input]);
  useEffect(()=>{window.addEventListener('blur',release);return()=>{window.removeEventListener('blur',release);release()}},[release]);
  const control=async()=>{
    setBusy(true);setError('');
    try{release();await inputQueue.current;setStatus(await api('control',{owner:status.owner==='USER'?'AGENT':'USER',epoch:status.epoch}));}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  };
  const start=async()=>{setBusy(true);setError('');try{await api('start',{});setStatus(s=>({...s,state:'starting'}));}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
  const coords=(e:{clientX:number;clientY:number})=>{
    const box=image.current?.getBoundingClientRect();
    if(!box)return null;
    const x=Math.floor((e.clientX-box.left)/box.width*status.width),y=Math.floor((e.clientY-box.top)/box.height*status.height);
    if(x<0||y<0||x>=status.width||y>=status.height)return null;
    return {x,y};
  };
  const keyName=(key:string)=>({Enter:'Return',Backspace:'BackSpace',Escape:'Escape',Tab:'Tab',ArrowLeft:'Left',ArrowRight:'Right',ArrowUp:'Up',ArrowDown:'Down',Control:'Control_L',Alt:'Alt_L',Shift:'Shift_L',Meta:'Super_L',Delete:'Delete',' ':'space',Home:'Home',End:'End',PageUp:'Prior',PageDown:'Next'}[key]||(/^[a-zA-Z0-9_]$/.test(key)?key:null));
  const title=profile?.display_name?`${profile.display_name}의 컴퓨터`:'Dots의 컴퓨터';
  return <section className="computer-view" aria-label={title}>
    <header className="computer-header"><button className="computer-icon" aria-label="대화로 돌아가기" onClick={onClose}><ArrowLeft size={18}/></button><div><Monitor size={18}/><h1>{title}</h1><span className={`computer-state ${status.connected?'online':''}`}>{status.connected?'연결됨':status.state==='starting'?'시작 중':status.state==='checking'?'연결 확인 중':'연결되지 않음'}</span></div><button className="computer-icon" aria-label="컴퓨터 닫기" onClick={onClose}><X size={18}/></button></header>
    {status.connected?<>
      <div className="computer-toolbar"><span>{status.owner==='USER'?<><MousePointer2 size={15}/>직접 제어 중</>:<><Monitor size={15}/>Dot이 사용할 수 있어요</>}</span><div><button onClick={()=>void input({action:'launch',app:'browser'})} disabled={status.owner!=='USER'}><ExternalLink size={15}/>브라우저</button><button onClick={()=>void input({action:'launch',app:'terminal'})} disabled={status.owner!=='USER'}><Terminal size={15}/>터미널</button><button onClick={()=>void input({action:'launch',app:'files'})} disabled={status.owner!=='USER'}><Folder size={15}/>파일</button><button className="computer-take" onClick={()=>void control()} disabled={busy}>{status.owner==='USER'?'Dot에게 돌려주기':'직접 제어하기'}</button></div></div>
      <div className={`computer-screen ${status.owner==='USER'?'has-control':''}`} tabIndex={status.owner==='USER'?0:-1} role="application" aria-label="원격 컴퓨터 화면. 직접 제어한 뒤 마우스와 키보드로 조작할 수 있습니다."
        onBlur={release} onContextMenu={e=>e.preventDefault()}
        onPointerDown={e=>{if(status.owner!=='USER')return;e.currentTarget.focus();const p=coords(e);if(p){e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);buttons.current.add(e.button+1);void input({action:'down',button:e.button+1,...p})}}}
        onPointerUp={e=>{const p=coords(e);if(buttons.current.delete(e.button+1))void input({action:'up',button:e.button+1,...(p||{})});if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
        onPointerMove={e=>{if(e.buttons){const p=coords(e);if(p)void input({action:'move',...p})}}}
        onPointerCancel={release} onLostPointerCapture={release}
        onWheel={e=>{if(status.owner!=='USER')return;const p=coords(e);if(p)void input({action:'scroll',delta:e.deltaY>0?-3:3,...p})}}
        onKeyDown={e=>{if(status.owner!=='USER')return;const key=keyName(e.key);if(key){e.preventDefault();keys.current.add(key);void input({action:'keydown',key})}}}
        onKeyUp={e=>{const key=keyName(e.key);if(key){e.preventDefault();keys.current.delete(key);void input({action:'keyup',key})}}}>
        {visible&&<img key={frame} ref={image} className="computer-live" src={`/api/computer/stream?v=${frame}`} alt="연결된 Linux 컴퓨터의 실시간 화면" draggable={false} onError={()=>setError('화면 스트림이 끊겼습니다. 다시 연결해 주세요.')}/>}
        {status.owner!=='USER'&&<div className="computer-control-hint">직접 사용하려면 ‘직접 제어하기’를 눌러 주세요.</div>}
      </div>
      <footer className="computer-footer"><Keyboard size={15}/><form onSubmit={e=>{e.preventDefault();if(text){void input({action:'type',text});setText('')}}}><input aria-label="컴퓨터에 입력할 텍스트" placeholder="긴 텍스트 입력…" value={text} onChange={e=>setText(e.target.value)} disabled={status.owner!=='USER'}/><button disabled={status.owner!=='USER'||!text}>입력</button></form><button onClick={()=>{setFrame(x=>x+1);setError('')}}><RefreshCw size={14}/>다시 연결</button><a href="/api/computer/screenshot" download="dots-computer.png">화면 저장<ArrowUpRight size={14}/></a></footer>
    </>:<div className="computer-empty"><div className="computer-empty-icon">{status.state==='starting'||status.state==='checking'?<LoaderCircle className="spin" size={38}/>:<Monitor size={38}/>}</div><h2>{status.state==='starting'?'컴퓨터를 준비하고 있어요':'Dot의 컴퓨터를 시작해 주세요'}</h2><p>브라우저, 터미널, 파일을 사용할 수 있는 별도의 컴퓨터입니다.<br/>직접 제어하거나 Dot에게 작업을 맡길 수 있어요.</p><button className="computer-start" disabled={busy||status.state==='starting'||status.state==='checking'} onClick={()=>void start()}>{status.state==='starting'?'시작 중…':'컴퓨터 시작'}</button>{status.error&&<p className="computer-connection-error" role="status">{status.error}</p>}<details><summary><CircleHelp size={14}/>연결 도움말</summary><p>Docker Desktop을 실행한 뒤 컴퓨터를 시작해 주세요. 첫 실행에는 필요한 파일을 내려받아 시간이 걸릴 수 있어요. 연결 주소는 설정에서 변경할 수 있습니다.</p></details></div>}
    {error&&<div className="computer-alert" role="alert">{error}<button aria-label="오류 닫기" onClick={()=>setError('')}><X size={15}/></button></div>}
  </section>;
}
export default ComputerView;
