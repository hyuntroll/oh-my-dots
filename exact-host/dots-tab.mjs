// Additional-Dot creation is a local feature. It uses the original shell and
// the existing profile mutation rather than falsifying the original catalog.
export function createDotsTab({React,initial,adapter,navigate}){
  const h=React.createElement;
  const inputStyle={display:'block',width:'100%',padding:12,borderRadius:12,border:'1px solid #6665',background:'transparent',color:'inherit',marginTop:8};
  return function DotsTab(){
    const [name,setName]=React.useState(''),[description,setDescription]=React.useState(''),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
    const [profiles,setProfiles]=React.useState(()=>adapter().profiles);
    React.useEffect(()=>adapter().subscribe({onUpdate:()=>setProfiles(adapter().profiles)}),[]);
    async function submit(event){event.preventDefault();if(busy)return;setBusy(true);setError('');try{const profile=await adapter().createDot({display_name:name,description});await adapter().refresh();setProfiles(adapter().profiles);navigate('/dots/'+profile.id);}catch(e){setError(e.message);}finally{setBusy(false);}}
    const content=h('main',{style:{padding:'48px 32px',maxWidth:900,margin:'0 auto',width:'100%',overflow:'auto'}},
      h('h1',{style:{fontSize:28,fontWeight:600}},'Dots'),h('p',{style:{opacity:.65,margin:'12px 0 28px'}},'나와 함께할 Dot을 추가하고 관리하세요.'),
      h('section',{'aria-label':'내 Dots',style:{display:'flex',gap:12,flexWrap:'wrap',marginBottom:36}},profiles.map(p=>h('button',{key:p.id,type:'button',onClick:()=>navigate('/dots/'+p.id),style:{padding:'18px 22px',border:'1px solid #6665',borderRadius:16,textAlign:'left'}},h('strong',null,p.display_name),h('p',{style:{opacity:.6,fontSize:13,marginTop:5}},p.description||'대화 열기')))),
      h('form',{onSubmit:submit,style:{maxWidth:500}},h('h2',{style:{fontSize:21,fontWeight:600,marginBottom:20}},'새 Dot 추가'),h('label',null,'이름',h('input',{required:true,maxLength:100,value:name,onChange:e=>setName(e.target.value),style:inputStyle,placeholder:'Dot 이름'})),h('label',{style:{display:'block',marginTop:20}},'역할 또는 소개',h('textarea',{value:description,maxLength:10000,onChange:e=>setDescription(e.target.value),style:{...inputStyle,minHeight:100},placeholder:'이 Dot과 어떤 일을 함께할까요?'})),h('p',{role:'alert',style:{color:'#e99696',marginTop:12}},error),h('button',{disabled:busy,type:'submit',style:{marginTop:20,padding:'11px 20px',borderRadius:14,background:'#f1cf61',color:'#242018',fontWeight:600}},busy?'추가 중…':'Dot 추가')));
    return h(initial.FR,null,h(initial.IR,null,content));
  };
}
