// Server storage is authoritative in service mode. Browser storage remains
// available only for the explicitly selected legacy single-user launcher.
export async function createAccountState(){
  const session=await fetch('/api/session',{credentials:'same-origin'}).then(r=>r.json());
  if(session.mode!=='service')return null;
  if(!session.authenticated){location.replace('/login');throw Error('로그인이 필요합니다.');}
  const response=await fetch('/api/ui-state',{credentials:'same-origin'});
  if(!response.ok)throw Error('계정의 화면 설정을 읽지 못했습니다.');
  const state=await response.json();let queue=Promise.resolve();
  const save=(section,key,value)=>{
    state[section][key]=value;
    const request=queue.catch(()=>{}).then(async()=>{
      const response=await fetch('/api/ui-state',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({section,key,value})});
      if(response.status===401){location.replace('/login');throw Error('로그인이 만료되었습니다.');}
      if(!response.ok)throw Error('계정의 설정을 저장하지 못했습니다.');
    });queue=request;
    request.catch(error=>{console.error(error);document.dispatchEvent(new CustomEvent('dots-storage-error',{detail:error.message}));});return request;
  };
  // Only the account explicitly attached to the old data directory may import
  // the browser's previous single-user metadata. Other accounts start empty.
  if(session.legacy&&!Object.keys(state.metadata).length){
    for(const [section,key]of [['metadata','dots-exact-local-metadata-v1'],['persisted','dots-exact-persisted-v1']]){
      let values;try{values=JSON.parse(localStorage.getItem(key)||'{}');}catch{continue;}
      if(!values||typeof values!=='object'||Array.isArray(values))continue;
      for(const [key,value]of Object.entries(values))if(!['__proto__','constructor','prototype'].includes(key))await save(section,key,value);
    }
  }
  return {session,state,save,flush:()=>queue,logout:async()=>{await queue.catch(()=>{});await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});location.assign('/login');}};
}
