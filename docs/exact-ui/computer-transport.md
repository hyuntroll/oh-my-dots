# Original computer panel and local transport

Evidence comes from the installed ASAR identified in `exact-assets.json` by SHA-256 `5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869`. These are client-side contracts. They do not reveal the cloud desktop implementation.

## Preserved component chain

The original app-initial exports `Wy` (`lNu`) as the computer attachment component. Its props include `conversationId`, optional `connectionThreadId`, `variant` (`expanded` by default), and `isVisible`. `Ky` (`oNu`) owns the presentation/container, takeover request, and handoff state; `Uy` (`cNu`) supplies the parking portal. The original computer tab has kind `cloud-aeon-computer` and ID `cloud-aeon-computer:${conversationId}`. Its normal availability selector requires a local-thread route and a durable host. Local availability needs a separate truthful adapter; labeling a local host as a cloud durable host is not part of this transport.

The tab's `Wy` component deliberately renders only an attachment div. It cannot render the panel by itself. Initialize `Gy()` and mount `Uy` with exactly `{conversationId}` once alongside the room content under the same scope. `Uy` observes `Ky.presentation$`, creates the lazy original panel, and portals it into the attached tab. The shipped `conversation-view-5867b536ab66.js` imports `Uy` as `ge` and renders `conversationId == null ? null : jsx(ge, {conversationId})` as a sibling of conversation content. Omitting this original portal host gives a blank tab with no panel errors or network activity even when availability and tab creation succeed.

The bounded extraction now includes this original dependency chain:

| Original asset | Responsibility |
| --- | --- |
| `panel-61683d263c1a.js` | `CloudAeonComputerPanel`; conversation ID, expanded/compact variant, environment status, connection factory |
| `last-frame-e8bf63af4f37.js` | Environment status query and actual captured last-frame cache |
| `session-4e4453ee5db4.js` | Export `r`: original session and video; export `t`: state/control wrapper |
| `view-442693ccea1c.js` | Export `t`: Dot name, avatar, color and original computer view composition |
| `view-ff276a0d8c16.js` | Export `t`: original computer chrome and observe/requesting/controlling states |
| `view-2b0f3a0fceee.css` | Unchanged computer component styles |
| `webauthn-c37be3fbf886.js` | Export `o`: live binding of the original remote desktop driver class `k`; initializer export `s` |

The session wrapper accepts `connection: {key, render(props)}` and passes the connection renderer `isControlActivated`, `onConnectionStateChange`, `onControlModeChange`, and `onVideoAspectRatioChange`. The session renders the original autoplay/muted/playsInline video element and handles actual playback, dimensions, mouse scaling and keyboard events. These elements are retained.

The original driver's `sendMouseEvent` passes only the button key for down/up packets; offset coordinates are read only for mousemove. The local transport therefore invokes inherited `mouseMoved` with a down/up event's actual offsets before inherited button handling. This reuses the original video letterbox scaling and fixes the first click after takeover when no earlier mousemove was delivered. Explicit coordinates supplied to `sendData` button calls are also clamped and honored. No UI event markup or original source was changed.

## Why an adapter is required

The original panel creates an SDP connection to `https://realtime.chatgpt.com/v1/cua?source=aeon&thread_id=...&aeon_id=...`. The driver creates an RTCPeerConnection, receives video tracks and sends JSON control messages plus binary mouse/key packets on a data channel. A PNG/MJPEG endpoint is not an SDP answer. Pointing the original cloud connection URL at a screenshot endpoint cannot work.

`exact-host/local-computer.mjs` subclasses the original driver and replaces only its peer/data transport. The server exposes a labeled derivative module containing this setter, leaving the manifest's source asset unchanged:

```js
export function ExactAdaptComputerTransport(adapt) {
  A();
  const Original = k;
  k = adapt(Original);
  return () => { k = Original; };
}
```

Installation must occur before mounting the panel, using `installLocalComputerTransport({driverModule})`. The live `k` binding is also the binding imported by the original session. The local subclass calls the original `_handleStream`, `_handleDataChannelDidOpen`, `_handlePeerDidResolve`, `_handleMessage`, `_handleModeDidChange`, and disconnect/error methods. Original inherited input scaling, keyboard handling, control buttons, and session view remain in use.

## Actual local contracts

The adapter reads `/api/computer/status`, validates the connected state, owner, epoch and dimensions, then reads actual PNG screenshots. It decodes each image, verifies its dimensions and draws it into a canvas whose `captureStream()` supplies the original video element. There is no replacement desktop image. Invalid screenshots or an offline desktop produce an error. Polling is sequential at 300ms; this is a local frame transport, not recovered cloud WebRTC.

Connection and frame reads never call `/start` or `/control`. An explicit original `control/request` reads fresh status and sends `/control` with `{owner:'USER', epoch}`. Only the actual response granting USER control produces `control/locked`. Inputs send `/input` with `actor:'USER'` and the acknowledged epoch. The input queue retains the generation and epoch so released or disconnected sessions cannot send queued input. A newer observed ownership epoch revokes local control. The backend remains authoritative for races between status reads.

Release sends `{owner:'AGENT', epoch}` only for the epoch this session actually acquired. A stale-epoch conflict never retries against a newer owner. A grant that completes after disconnect is released using only that grant's acknowledged epoch. Disconnect clears polling, stops the captured video tracks, closes the local channel and uses the original disconnect event path.

`last-frame` queries use `/tbo/{id}/environment/status?thread_id=...`; the data adapter maps this to the actual computer status. The local environment ID is `local-desktop`; capability `remote_desktop` is ready only when the actual desktop is connected. A status read does not start Docker. Explicit original environment start/recreate operations use the actual `/api/computer/start` endpoint. All local Dots currently share this one isolated Linux desktop, as documented in `../computer.md`.

Clipboard synchronization, horizontal scrolling, passkey forwarding and browser-tab handoff are not implemented by the local desktop service. The adapter reports these explicitly. It never emits passkey approval/resolution or claims a cloud handoff completed. The server-to-container token stays on the server.

## Verification and remaining runtime work

`node --test tests/original-computer.test.mjs` passes ten targeted tests covering read-only connection, invalid screen data, epoch-gated inputs, ownership changes, queued input cancellation on release, release/disconnect, a pending grant during disconnect, unsupported clipboard/passkeys, keysym mapping, a first right click without prior mousemove, explicit button coordinates and captured-stream cleanup. The frame test uses a controlled PNG fixture and browser API doubles; it does not establish that a running desktop has been observed in the original panel.

Runtime verification subsequently observed the actual 1280×960 video in the original panel, explicitly acquired USER ownership with an advancing epoch, and confirmed keyboard input changed the actual Chromium desktop. After the coordinate repair, the first right click following takeover opened Chromium's actual context menu. Escape dismissed it and the original return button released ownership to AGENT; the backend confirmed epoch `11717251003012`. `docs/qa/exact-ui/computer-panel.png` captures the running local panel. Cloud SDP, per-Dot cloud VMs, passkey forwarding and browser handoff are outside the implemented local transport.
