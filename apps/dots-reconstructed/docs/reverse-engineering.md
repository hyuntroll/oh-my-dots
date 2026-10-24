# Dots REA findings

## Target and method

Target: `/Applications/ChatGPT.app/Contents/Resources/app.asar`, build 26.1013.40934 (20770), SHA-256 `5ddc4e48259aa6f979e04529b1a5a4ae54b0f5c4ad6db5c6e004924c10916ddb`. The installed digest was verified against the retained prior analysis before reuse. This investigation selected Dots modules rather than reimplementing the whole ChatGPT application. No original account credentials or conversation store was imported.

Fresh REA parent `ev_d5abe43373ec1b20148b2792734526fe58fe6bd2d006f852b164577c2e24bc2f` and summary projection `ev_1ee69bb081d432b1906ce2292cdb366fbd21a527ca1bc2d77433f9fcbbdcdb12` cover the selected Dot, appearance picker, summary identity, side panel, onboarding start, draft creation, response status and room view modules. Retained execution-flow evidence for the matching digest is `ev_32f4cfbe87510490f813b779043616a63c9fbe1aec5876da2f9b445a1404dadf`. Exact module paths and anchors are in `evidence/fresh-rea-summary.json`, `evidence/shipped-module-inventory.json` and the three focused source-evidence reports.

The canonical REA session was exported, compressed, decompressed and SHA-256 verified against the original export. `evidence/rea-session-manifest.json` records the export size/hash and four retained records. Seven unrelated native module integrity mismatches are recorded by REA; those native files were not used. This selected static analysis is not a claim of complete application coverage or original authenticated runtime behavior.

## Evidence ledger

| Feature | Observed in shipped client | Local implementation choice | Unknown or unavailable |
| --- | --- | --- | --- |
| Creation | Draft/onboarding stages; accepted, rejected and unknown creation results | SQLite profile/room creation with stable request ID, explicit unknown recovery | Original account eligibility and cloud provisioning |
| Conversation | Distinct profile, room, root-thread and task IDs; request IDs and idempotency nonce | Local room UUIDs, durable requests/messages/tasks and explicit nonce retry | Cloud transport authority and inference session internals |
| Live state | Room/subscription identity checks, monotonic revisions, retry behavior, input responses | SSE with durable event revisions and replay, task queue and approvals/questions | Original scheduler, orchestration policies and hidden memory/planning loop |
| Profile UI | Floating 300px panel, responsive overlay/shift/gutter, scroll hero collapse, activity transcript | React and source-guided CSS; explicit Back focus restoration | Account flags and the entire original app navigation shell |
| Character | Native frame, WASM/data, original activity enum, serialized ORBAST1 appearance and thumbnails | Retained renderer with documented local host patches; new React bridge and editor | Authored C++ sources; access to unreleased server-delivered assets |
| Computer | Preview/open computer surfaces, ownership and action concepts | Separate Docker Linux desktop, real PNG/MJPEG frames, epoch-bound control, approved actions | Original cloud computer implementation and provisioning |
| Model/tools | Client displays response and execution items | Installed OpenCode account, scoped MCP/native or validated inference-envelope loop | Original prompts, provider routing, sandbox and tool authorization source |
| Connections | Setup and connected-service UI concepts | Honest unavailable state for email/calendar; actual local computer status | Original connector accounts and cookie/session stores |

## Reconstruction boundary

This is a standalone Dots-focused functional reconstruction. It retains exact local character assets, but the new backend is independently authored. It does not unlock the original cloud product or recover its server harness. Korean copy and CSS spring approximation are local choices; the onboarding ring approximates the original motion rather than claiming identical Three.js choreography. Explicit runtime verification and remaining limitations belong in `verification.md`, separate from static findings.
