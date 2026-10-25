import{n as e}from"./rolldown-runtime-2d059c5e81f4.js";import{LNt as t,PBt as n,XOt as r,tkt as i}from"./app-shared-fc3316d48427.js";import{CCn as a,U7 as o,W7 as s,cbr as c,fbr as l,sbr as u,wCn as d}from"./app-initial-dddef47d6ef6.js";import{c as f,l as p}from"./aeon-appearance-colors-44b97267b67f.js";import{n as m,t as h}from"./view-ff276a0d8c16.js";function g(e=`https://chatgpt.com/backend-api`){let t=new URL(e),n=t.hostname===`chatgpt-staging.com`||t.hostname.endsWith(`.chatgpt-staging.com`);if(!n&&t.hostname!==`chatgpt.com`)throw Error(`Unsupported desktop backend`);let r=new URL(n?`https://realtime.chatgpt-staging.com/v1/cua`:`https://realtime.chatgpt.com/v1/cua`),i=t.hostname.match(/^(dev-ephemeral-pr[0-9]+)(?:-|\.)/)?.[1];return i!=null&&r.searchParams.set(`staging_env`,i),r.href}var _;function v(){return(v=e((()=>{_=`
import json, os, secrets, subprocess, time
from pathlib import Path
launcher = ["/usr/local/bin/cloud-agent-desktop"]
# Reserved exit codes let the client report failures without exposing subprocess output.
if not os.path.isfile(launcher[0]):
    raise SystemExit(10)
if os.getuid() != 1000:
    raise SystemExit(11)
def status():
    result = subprocess.run(launcher + ["status"], capture_output=True, timeout=5)
    return json.loads(result.stdout) if result.returncode == 0 else None
ready = status()
if not ready or ready.get("status") != "ready":
    subprocess.Popen(
        launcher + ["serve"],
        env={**os.environ, "ORBIT_OS": "true", "BROWSER_HEADLESS": "false"},
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    deadline = time.monotonic() + 95
    while True:
        ready = status()
        if ready and ready.get("status") == "ready":
            break
        if time.monotonic() >= deadline:
            raise SystemExit(12)
        time.sleep(1)
# Use the desktop's WebAuthn relay, and let Chromium own its profile before
# an app opens a sign-in link via xdg-open (which would start unmanaged Chromium).
# The controller persists this guest-local service token; never return it to the viewer.
token = os.environ.get("NODE_REPL_AUTH_TOKEN")
if not token:
    try:
        token = json.loads((Path.home() / ".local/state/browser/credentials.json").read_text())["mcp_token"]
    except FileNotFoundError:
        token = secrets.token_urlsafe(32)
try:
    browser = subprocess.run(
        ["/usr/local/bin/cloud-agent-browser-runtime", "activate"],
        env={**os.environ, "DISPLAY": ready["display"], "XAUTHORITY": ready["xauthority"],
             "NODE_REPL_AUTH_TOKEN": token, "ORBIT_OS": "true", "BROWSER_HEADLESS": "false",
             "CUA_REPL_BROWSER_ENV": "orbit", "ENABLE_WEBAUTHN": "true", "ENABLE_BROWSER_CREDENTIAL_CAPABILITIES": "false"},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=125,
    )
    ready["browser_ready"] = browser.returncode == 0
except (FileNotFoundError, subprocess.TimeoutExpired):
    ready["browser_ready"] = False
ready["session_id"] = os.environ["CODEX_CAAS_SESSION_ID"]
print(json.dumps(ready))
`})))()}function y(e){let t=(0,x.c)(19),n,r,a,s,l;t[0]===e?(n=t[1],r=t[2],a=t[3],s=t[4],l=t[5]):({conversationId:n,orbitAvatar:s,orbitColor:l,orbitName:r,...a}=e,t[0]=e,t[1]=n,t[2]=r,t[3]=a,t[4]=s,t[5]=l);let p=s===void 0?u.avatar:s,m=l===void 0?c:l,g;t[6]===r?g=t[7]:(g=d(r)?(0,S.jsx)(i,{id:`restricted.aeon.computer.unnamedOrbitControl.brand.dot`,defaultMessage:`Your <b>dot</b> has control`,description:`Status shown while the dot assistant has computer control and its name has not loaded. dot is the untranslated term for the user's agent; the b tag makes it bold.`,values:{b}}):(0,S.jsx)(i,{id:`restricted.aeon.computer.orbitControl`,defaultMessage:`{orbitName} has control`,description:`Status below the live computer while the dot has mouse and keyboard control. The orbitName placeholder is the assistant's display name, shown in bold.`,values:{orbitName:(0,S.jsx)(`strong`,{children:r})}}),t[6]=r,t[7]=g);let _=d(r)?null:r,v=m??`cyan`,y;t[8]===v?y=t[9]:(y=f(v),t[8]=v,t[9]=y);let C;t[10]!==n||t[11]!==p?(C=(e,t)=>(0,S.jsx)(o,{className:e,avatar:p,identity:n,animated:t}),t[10]=n,t[11]=p,t[12]=C):C=t[12];let w;return t[13]!==a||t[14]!==g||t[15]!==_||t[16]!==y||t[17]!==C?(w=(0,S.jsx)(h,{...a,assistantControlLabel:g,computerName:_,controlColors:y,renderControlAvatar:C}),t[13]=a,t[14]=g,t[15]=_,t[16]=y,t[17]=C,t[18]=w):w=t[18],w}function b(e){return(0,S.jsx)(`strong`,{children:e})}var x,S;function C(){return(C=e((()=>{x=n(),r(),m(),p(),l(),s(),a(),S=t()})))()}export{v as a,g as i,C as n,_ as r,y as t};
//# sourceMappingURL=view-442693ccea1c.js.map