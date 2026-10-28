export function installProviderConnection({api,onSaved}){
  const $=s=>document.querySelector(s),form=$('#provider-form');
  let models=[],selected=null,shown=50,version=0,pending=false;
  const names={openai:'OpenAI',anthropic:'Anthropic',openrouter:'OpenRouter',ollama:'Ollama',compatible:'호환 서버'};
  const canChat=m=>!m.outputModalities?.length||m.outputModalities.includes('text');
  const message=text=>{$('#discovery-status').textContent=text;};
  function render(){
    $('#discovered').hidden=!models.length;
    const query=$('#catalog-search').value.toLowerCase();
    const filtered=models.filter(m=>(m.name+' '+m.id).toLowerCase().includes(query)&&(!$('#text-only').checked||canChat(m))&&(!$('#vision-only').checked||m.inputModalities?.includes('image')));
    $('#model-count').textContent=filtered.length+' / '+models.length+'개';$('#catalog').replaceChildren();
    for(const model of filtered.slice(0,shown)){
      const row=document.createElement('label');row.className='model-row';
      const radio=document.createElement('input');radio.type='radio';radio.name='catalog-choice';radio.value=model.id;radio.checked=selected===model.id;radio.disabled=!canChat(model);
      radio.onchange=()=>{selected=model.id;render();};
      const info=document.createElement('span');info.className='model-info';const title=document.createElement('strong');title.textContent=model.name;const id=document.createElement('small');id.textContent=model.id;info.append(title,id);
      const badges=document.createElement('span');badges.className='model-badges';
      for(const value of [model.contextLength?Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(model.contextLength)+' context':null,model.inputModalities?.includes('image')?'이미지':null,model.tools?'도구':null,!canChat(model)?(model.outputModalities||[]).join(' · '):null].filter(Boolean)){const badge=document.createElement('span');badge.className='badge';badge.textContent=value;badges.append(badge);}
      row.append(radio,info,badges);$('#catalog').append(row);
    }
    if(!filtered.length){const empty=document.createElement('p');empty.textContent='검색 결과가 없습니다. 검색어나 필터를 바꿔 보세요.';$('#catalog').append(empty);}
    $('#catalog-more').hidden=filtered.length<=shown;$('#save-provider').disabled=!selected||pending;
    $('#selected-model').textContent=selected?models.find(m=>m.id===selected)?.name||selected:'모델을 선택해 주세요';
  }
  function reset(){version++;models=[];selected=null;shown=50;form.elements.apiKey.value='';form.elements.baseUrl.value='';$('#manual-model').value='';message('');render();}
  for(const button of document.querySelectorAll('[data-provider]'))button.onclick=()=>{if(pending)return;reset();form.elements.provider.value=button.dataset.provider;for(const b of document.querySelectorAll('[data-provider]'))b.setAttribute('aria-pressed',String(b===button));const local=button.dataset.provider==='ollama';form.elements.apiKey.placeholder=local?'로컬 서버는 비워둘 수 있습니다':'API 키를 입력하세요';$('#endpoint-details').open=['ollama','compatible'].includes(button.dataset.provider);};
  for(const field of [form.elements.apiKey,form.elements.baseUrl])field.oninput=()=>{version++;models=[];selected=null;message('');render();};
  $('#discover').onclick=async()=>{
    if(pending)return;const revision=++version;pending=true;$('#discover').disabled=true;message(names[form.elements.provider.value]+'에서 모델 목록을 불러오는 중…');
    try{const result=await api('/api/providers/discover','POST',{provider:form.elements.provider.value,apiKey:form.elements.apiKey.value,baseUrl:form.elements.baseUrl.value});if(revision!==version)return;models=result.models;shown=50;selected=models.find(canChat)?.id||null;message(models.length?models.length+'개 모델을 찾았습니다. '+result.notice:'조회된 모델이 없습니다. 제공자에서 모델 접근 권한을 확인해 주세요.');}
    catch(e){if(revision===version)message(e.message);}
    finally{pending=false;$('#discover').disabled=false;render();}
  };
  for(const id of ['#catalog-search','#text-only','#vision-only'])$(id).addEventListener('input',()=>{shown=50;render();});
  $('#catalog-more').onclick=()=>{shown+=50;render();};
  $('#manual-add').onclick=()=>{const id=$('#manual-model').value.trim();if(!id||/\s/.test(id)){message('모델 ID를 확인해 주세요.');return;}if(!models.some(m=>m.id===id))models.push({id,name:id,inputModalities:[],outputModalities:[]});selected=id;render();message('직접 추가한 모델은 연결 후 실제 호출 시 사용 가능 여부를 확인합니다.');};
  form.onsubmit=async event=>{event.preventDefault();if(pending||!selected)return;pending=true;render();try{const result=await api('/api/service-settings','PATCH',{provider:form.elements.provider.value,baseUrl:form.elements.baseUrl.value,apiKey:form.elements.apiKey.value,model:selected,models:models.filter(canChat).map(m=>({id:m.id,name:m.name}))});form.elements.apiKey.value='';message('연결을 저장했습니다. 모델 탭에서 사용할 모델을 선택할 수 있습니다.');await onSaved?.(result);}catch(e){message(e.message);}finally{pending=false;render();}};
}
