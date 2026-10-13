# Dot computer connection continuity — 2026-10-13

## Symptom and root cause

The desktop could look like it repeatedly disconnected. ComputerView rebuilt its noVNC instance whenever the polled computer.connected flag changed. A single failed health request during the two-second polling cycle therefore disconnected a working video socket and cleared its canvas. Returning to a visible tab or receiving an online event also unconditionally rebuilt the connection. Input-request errors unnecessarily reset the video connection too.

## Fix

The screen transport now owns its lifecycle through connectComputerStream. Health polling continues to guard input and control requests but cannot tear down working video or cover it with an offline placeholder. Visibility/online events refresh control state and accelerate recovery only when the transport is already disconnected. Explicit refresh still replaces the socket. Actual disconnects and stalled handshakes retain automatic recovery, with duplicate events deduplicated and stale asynchronous imports discarded on unmount.

No VNC authentication, API authentication, input ownership, epoch validation or takeover protections were removed. The browser remains view-only over VNC; input still uses the authenticated API.

## Evidence

- 21 web tests passed, including five new transport tests. TypeScript typecheck and git diff --check passed. The 89 Python tests also passed.
- Reintroducing unconditional resume into a temporary copy made the healthy-stream regression fail (`1 !== 0`). The corrected implementation passes repeated resume, actual disconnect, timeout, import/unmount race and cleanup cases.
- Actual localhost UI connected to the Docker desktop. An uncommitted QA-only middleware returned HTTP 503 for the computer health endpoint for multiple polling cycles while leaving VNC intact. Both direct and gateway API requests confirmed 503. The browser still showed one canvas, “실시간 연결”, and no offline placeholder. The server log recorded exactly one screen connection before and during the fault.
- Restarting the API closed the real screen socket; the UI reconnected automatically. The QA middleware and fault flag were then removed from the running configuration and the normal API factory restored.
- Screenshots: `.local/qa/computer-stream-health-fault.png` and `.local/qa/computer-stream-fixed.png` (local only, not committed).

## Local environment and limits

Another project owns localhost:15432, so this validation used the existing OhMyDots database volume through localhost:25432, with an ignored override at `.local/qa/computer-stream-compose.yaml`. The application URL remains localhost:3080. Restarted per-Dot containers had new published ports; their saved local connection addresses were refreshed. These are local runtime changes, not new deployment defaults.

Status: DONE_WITH_CONCERNS. Avoidable frontend reconnects are corrected and short fault/recovery scenarios are verified. Historical disconnect frequency, prolonged network degradation and long-duration use have not been measured. AI reasoning pauses and screen analysis on Return control are separate from video continuity.
