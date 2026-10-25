const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./dist-26562b352026.js","./index-CgCByfHL-8d4b43b1e8e0.js","./rolldown-runtime-2d059c5e81f4.js","./app-shared-fc3316d48427.js","./app-shared-295ec67e1c5d.css","./dist-736df76258d6.js"])))=>i.map(i=>d[i]);
import{n as e}from"./rolldown-runtime-2d059c5e81f4.js";import{F3 as t,FBt as n,I3 as r,LNt as i,MNt as a,NNt as o,OFt as s,PBt as c,XOt as l,Y3 as u,Z3 as d,kFt as f,tkt as p}from"./app-shared-fc3316d48427.js";import{Man as m,Nan as h,jan as g}from"./app-initial-dddef47d6ef6.js";function _(e){let t=(0,b.c)(9),[n,r]=(0,x.useState)(!1),[i,o]=(0,x.useState)(null),s=n&&`my-3`,c;t[0]===s?c=t[1]:(c=a(s),t[0]=s,t[1]=c);let l;t[2]===Symbol.for(`react.memo_cache_sentinel`)?(l=e=>{if(e==null)return;let t=new ResizeObserver(()=>r(e.getBoundingClientRect().height>0));return t.observe(e),()=>t.disconnect()},t[2]=l):l=t[2];let u;t[3]!==i?.widget||t[4]!==e?(u=i?.widget===e.widget?(0,S.jsx)(v,{onRetry:()=>o(null)}):(0,S.jsx)(w,{...e,customCss:C,errorMode:`soft`,onError:t=>{o({widget:e.widget}),e.onError?.(t)}}),t[3]=i?.widget,t[4]=e,t[5]=u):u=t[5];let d;return t[6]!==c||t[7]!==u?(d=(0,S.jsx)(`div`,{className:c,ref:l,children:u}),t[6]=c,t[7]=u,t[8]=d):d=t[8],d}function v(e){let t=(0,b.c)(7),{reload:n,onRetry:r}=e,i;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(i=(0,S.jsx)(p,{id:`chatgptConversations.dil.renderFailure`,defaultMessage:`This widget couldn’t load`,description:`Shown in a ChatGPT response when a legacy widget fails to load or render`}),t[0]=i):i=t[0];let a;t[1]!==r||t[2]!==n?(a=()=>{n?window.location.reload():r?.()},t[1]=r,t[2]=n,t[3]=a):a=t[3];let o;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(o=(0,S.jsx)(p,{id:`chatgptConversations.dil.retry`,defaultMessage:`Try again`,description:`Button to retry a failed widget, reloading the page if its renderer could not be downloaded`}),t[4]=o):o=t[4];let s;return t[5]===a?s=t[6]:(s=(0,S.jsxs)(`div`,{className:`flex items-center gap-2 text-secondary`,role:`status`,children:[i,(0,S.jsx)(u,{type:`button`,color:`secondary`,onClick:a,children:o})]}),t[5]=a,t[6]=s),s}function y(e){let t=(0,b.c)(5),{widget:n,state:r}=e,i=h(m()),a=n,o;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(o=[],t[0]=o):o=t[0];let s;return t[1]!==r||t[2]!==a||t[3]!==i?(s=(0,S.jsx)(`div`,{inert:!0,children:(0,S.jsx)(x.Suspense,{fallback:null,children:(0,S.jsx)(_,{theme:i,widget:a,initialState:r,supportedClientActions:o})})}),t[1]=r,t[2]=a,t[3]=i,t[4]=s):s=t[4],s}var b,x,S,C,w;function T(){return(T=e((()=>{b=c(),o(),x=n(),l(),d(),t(),g(),S=i(),f(),C=`
:host {
  --codex-dil-host-text: var(--color-text);
  --codex-dil-host-text-secondary: var(--color-text-secondary);
  --codex-dil-host-text-tertiary: var(--color-codex-description);
  --codex-dil-host-surface: var(--color-surface);
  --codex-dil-host-surface-secondary: color-mix(in srgb, var(--color-surface-secondary) 92%, transparent);
  --codex-dil-host-surface-tertiary: color-mix(in srgb, var(--color-surface-secondary) 85%, transparent);
  --codex-dil-host-border: var(--color-border);
  --codex-dil-host-border-subtle: var(--color-border-subtle);
  --codex-dil-host-border-strong: var(--color-border-strong);
  --codex-dil-host-ring: var(--color-ring);
}

/* Preserve PUIK's small-text metrics so fixed-height review cards fit their text.
 * https://github.com/openai/openai/blob/master/chatgpt/web/styles/puik/variables-semantic.css
 */
:host,
:where([data-theme]) {
  --font-sans: var(--font-ui-family, var(--font-sans-default));
  --font-text-md-size: var(--codex-chat-font-size);
  --font-text-md-line-height: calc(var(--codex-chat-font-size) + 8px);
}

/* Nested widget themes must keep their own palette. */
:host > :where([data-theme]) {
  --color-text: var(--codex-dil-host-text);
  --color-text-emphasis: var(--codex-dil-host-text);
  --color-text-prose: var(--codex-dil-host-text);
  --color-text-secondary: var(--codex-dil-host-text-secondary);
  --color-text-tertiary: var(--codex-dil-host-text-tertiary);
  --color-surface: var(--codex-dil-host-surface);
  --color-surface-secondary: var(--codex-dil-host-surface-secondary);
  --color-surface-tertiary: var(--codex-dil-host-surface-tertiary);
  --color-border: var(--codex-dil-host-border);
  --color-border-subtle: var(--codex-dil-host-border-subtle);
  --color-border-strong: var(--codex-dil-host-border-strong);
  --color-ring: var(--codex-dil-host-ring);
}

/* Keep selection local until the vendored DIL bundle includes PUIK's reset. */
@layer base {
  ::selection {
    color: var(--color-text);
  }
}
`,w=r(async()=>(await s(async()=>{let{DILRenderer:e}=await import(`./dist-26562b352026.js`);return{DILRenderer:e}},__vite__mapDeps([0,1,2,3,4,5]),import.meta.url)).DILRenderer,{errorFallback:(0,S.jsx)(v,{reload:!0})})})))()}export{T as i,_ as n,y as r,C as t};
//# sourceMappingURL=renderer-3e523429ffe8.js.map