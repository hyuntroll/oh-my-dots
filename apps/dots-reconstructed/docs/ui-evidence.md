# Dots UI reconstruction and verification requirements

This folder is an independent local reconstruction. It does not load the ChatGPT application, call its account APIs, or claim to recover its server harness. Original source paths below refer to the read-only installed `/Applications/ChatGPT.app/Contents/Resources/app.asar` build 26.1013.40934 (20770), SHA-256 `5ddc4e48259aa6f979e04529b1a5a4ae54b0f5c4ad6db5c6e004924c10916ddb`. This digest was rechecked against the installed file during this investigation.

## Static source observations

| Surface | Authoritative shipped source | Required reconstruction behavior |
| --- | --- | --- |
| Profile and room identity | `webview/assets/orbit-conversation-route-e54c64cb799f.js` profile `active_root_thread_id` and `display_name`; `conversation-view-b8157d99d576.js` `messaging_room_id` | Keep profile, room, message and task IDs distinct; retain state across reload; select dots in the sidebar. |
| Creation | `webview/assets/page-3f5e759fa37f.js`, create flow at UTF-16 offsets 102251–102850 | Distinguish creating, accepted, rejected/failed and unknown; an unknown result must not trigger another implicit creation. |
| Setup surfaces | Same `page` module: computer at 24781, connections at 64198, notification at 79409, creation at 74408 | Provide setup, editable appearance/name, actual local capabilities, skip unavailable connectors, request notification permission only on user action. Local availability differs from original account gating. |
| Messaging | `webview/assets/native-room-ecbd2ba1aadf.js`, `composer-controls-db9f3c1ee1ee.js` | Display chronological messages, loading/streaming, unknown delivery, retry; reuse original request/token on retry rather than create a second request. |
| Task transcript | `webview/assets/side-panel-ca01b35697cf.js` at 28439 and 30197; original transcript renderer modules | Show actual queued/working/input/completed/error/cancel states, tool results, approval/questions and artifacts; permit explicit stop/resume through backend. |
| Floating profile | `webview/assets/side-panel-ca01b35697cf.js`, SHA-256 `3f51bc9d7f762114be465ec11fa348ebf1e6970090527f3ba8c7a58300bd4272`, `data-orbit-profile` at 90925, dynamic island at 91326, profile title at 94610 | Nonmodal floating profile containing identity, computer accordion, notifications, activity and outputs. Activity replaces content with transcript; Back restores the triggering button's focus. |
| Scroll identity | Same side panel at 89686 and 90282; `aeon-summary-panel-identity-9008df4e6a28.js` | Collapse after scrollTop > 1 into a 48px sticky header, avatar 64px to 20px; identity geometry moves over 150ms. Paused, active, recently active have distinct original semantics. |
| Responsive profile | `thread-summary-panel-layout-488b931a4b80.js` | Default profile 300px; available content width <1096px overlay, 1096–1535px shift, >=1536px gutter. Shift is -154px at 300px panel width. Use content width after sidebar, not whole viewport. |
| Profile motion | `thread-summary-panel-components-ec39d6b5d7bc.js` at 11385; `app-initial-90eb42395b7d.js` at 3785181 | Source uses panel spring duration 300ms/bounce .01, content shift 500ms/bounce .1; local CSS approximates these curves and respects reduced motion. |
| Computer row | Side panel at 51849, 76714, 77772 | 48×32 preview frame, computer accordion, open actual computer view. No synthetic live-desktop image or fake connected badge. |
| Appearance | `aeon-appearance-picker-329fc29c1361.js` name maxLength24 and no backslashes; `editor-placeholder-14579b932502.js` | Name and description editing, native appearance serialization, 480px 3:2 editor, responsive layout, persisted PNG snapshot; preserve state when editing fails. |
| Character | Original orbit-character frame/presentation/activity/runtime tree | Use isolated original renderer and appearance bytes, map Working1/Searching2/Creating3/Payment4/Thinking5/NeedsInput6/Ready7/Paused8/Error9, visibility lifecycle, reduced motion, pointer attention. |
| Computer settings | `settings-95849fbd912d.js` and profile computer actions | Honest connection status, explicit actual environment address, real computer screen and user/agent ownership. No original account-cookie store is reconstructed. |

Historical REA records for this same digest: UI `ev_21def76128d9c0c1ff6ec1894cb6d707f0483952af40564487393b84f6a99cce`, core motion `ev_d19d90be8d7b629407155d8c5e740faaea455b7362d8a3ab3d4ded42b829a2aa`, character `ev_3fb33ac4ddd21662f1f1b2aa7bbc522fae8903e68fde83bc6314bbf33df46830`, execution `ev_32f4cfbe87510490f813b779043616a63c9fbe1aec5876da2f9b445a1404dadf`. These are provenance references to static analysis, not proof of runtime execution. The current task's fresh REA records are documented by the main investigation.

## Verification gates

- Build and TypeScript across the standalone folder, with no imports from the older workspace.
- Create a real profile via onboarding, save native appearance and name, reload and verify them.
- Send a real message through OpenCode; check task streaming/final reply and durable room history.
- Approval/question response reaches the live waiting task; tool outputs and workspace file artifact can be opened.
- Stop and resume paths update task and profile state; pausing keeps queued messages without pretending work ran.
- Multiple dots have isolated messages/tasks; peer messages appear only after approval.
- Profile hero/compact, activity Back focus restoration, name/description/delete, settings search/selection and theme work with keyboard.
- Desktop and narrow viewport remain operable, dialogs constrain focus, Enter submits, Shift+Enter inserts a newline, IME composition never submits.
- Computer entry renders the actual connected environment, with truthful unavailability until the service responds.

## Known fidelity limits

Static source observations establish available client behavior, not which original account flags are enabled. Korean copy is reconstructed. CSS easing approximates source Motion springs; onboarding uses a local ring animation rather than the entire original Three.js transition choreography. No original server system prompt, scheduler, model policy or hidden planning/memory loop is claimed. This local implementation's OpenCode adapter and workspace approval policy are independently implemented. All these limits must remain separate from functional verification results.

## Runtime review: computer availability

Onboarding describes computer connection as “연결 설정 가능”. A configured service URL is not evidence that the computer is running or connected. Only the actual `/api/computer/status` response drives the ComputerView “연결됨” indicator. Profile and setup surfaces do not fabricate a connected badge or desktop preview. The current Docker build/start outcome must be reported independently from frontend build and character rendering verification.

## Runtime review: portrait identity and narrow computer navigation

Sidebar, assistant-message and active-task avatars use the isolated native portrait renderer via its shared serialized queue and appearance/preset cache. Until that actual portrait is ready the UI shows a neutral loading placeholder, never a fabricated green character. Opening the computer from a narrow viewport closes the navigation drawer before displaying the real computer screen.

The completed/queued/error colors are scoped to `.status-dot` indicators. Attached task buttons retain the neutral surface and readable text in light and dark themes; a task status must not color the entire button background.

Activity Back focus restoration retains the task ID, not a detached DOM button. Fresh activity rows register in a keyed ref map, and a layout effect focuses the newly mounted matching row after profile content returns.

Approval review displays both the write destination and complete scrollable file contents. Computer approval displays the complete stored args, or the matching preceding computer tool call for older pending records, including application, coordinates, text and other concrete inputs.
