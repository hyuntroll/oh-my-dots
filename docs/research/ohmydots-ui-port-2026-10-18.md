# OhMyDots UI source port — 2026-10-18 revision 3

User direction: replace existing UI first, using installed ChatGPT desktop as the reference across onboarding, chat, dot, settings and computer surfaces. This revision supersedes the earlier CSS-overlay adaptation.

## Reference and implementation

Source: installed ChatGPT desktop build 20770, inspected statically. Original app runtime UI access was unavailable; no pixel comparison against a running original app is claimed. The standalone local character renderer (WASM, data, frame and thumbnail assets) is now embedded; its local source changes and hashes are in apps/web/public/dot-engine/provenance.json. ChatGPT account APIs and the full application bundle are not embedded.

| Surface | Source evidence | Applied locally |
| --- | --- | --- |
| Onboarding | page-3f5e759fa37f.js: shared layout ca/la/ua/da, intro, computer, appearance, connectors, notification flow | Full-screen introduction → computer → appearance → connections → notifications → ready; 448px stack, 432px cards, 24px card radius, 20/28 heading, 40px row icons |
| Computer onboarding illustration | computer-preview-64538a5b8034.png | Copied actual static asset; provenance and hash next to asset |
| Appearance | aeon-appearance-picker-329fc29c1361.js | 480px CharacterEditor with 3:2 controls/preview columns; actual shape/eyes/eyewear/accessory catalog and color swatches, native drag/reaction, persistent appearance bytes and PNG; responsive stacked layout |
| Dot artwork | Dot-7cb00c0b541f.js / source palette | Actual isolated single-thread character runtime, activity state mapping, 10-second Ready gaze attention, visibility/reduced-motion handling; snapshots for small avatars and SVG fallback |
| Summary identity | aeon-summary-panel-identity-9008df4e6a28.js | Floating 300px profile with 64→20px scroll-collapse avatar, 48px sticky header, responsive overlay/shift/gutter, activity transcript with Back/focus restore, 48×32px computer thumbnail |
| Shell and chat | sidebar / orbit conversation / thread detail modules | Persistent sidebar and collapsed rail, search dialog, compact header, rounded dot-color messages/composer |
| Settings | settings-page-cd654a99d29b.js | Full workspace; collapsible navigation, search, shared row and form styles; all fourteen existing sections use shared tokens |
| Library, plugins, computer | source surface conventions + existing functional components | Rebuilt CSS for every route; existing file/API/VNC transport retained |
| Electron | local shell | Removed old pet titlebar, 40px native drag region; light/dark theme sync via constrained preload IPC |
| Remote start page | source computer-preview image | Removed old pet and greeting from visual layout; clock/speech/shortcut structure and neutral palette; actual supported shortcuts retained |

Four stylesheets now own disjoint concerns: global primitives/execution cards, computer canvas chrome, settings/library/plugins, and main shell/onboarding/dot. The accumulated old layout overrides were removed rather than appended to.

Settings → General → Replay onboarding opens the entire new flow without deleting conversations or resetting setup completion. Unsupported contact/SharePoint/Teams connection actions remain disabled. Permission prompts are only requested from explicit button clicks. AI account/model setup remains in Settings, including OpenCode 2.

## Validation

- Production Next build and TypeScript: passed.
- Web tests: 24 passed, including character state persistence and execution-to-motion mapping.
- Current backend run/profile tests: 14 passed, including persisted appearance and invalid input rejection. Prior provider/runtime/catalog/execution/registry suite: 57 passed.
- CUA UI checks: all onboarding stages, completion back to chat, search empty state, all 14 settings categories, library, computer connection, 390×844 mobile appearance/settings, light/dark, actual Electron titlebar.
- Native Electron and production web server left running.
- Runtime screenshots in docs/ui-evidence. The final native Electron app is left open with the updated UI.

## Remaining fidelity and behavior limits

This is a source-guided implementation, not a verified pixel-identical clone. Localized copy, feature availability, remaining onboarding illustrations and native menu behavior differ. Character animation uses the bundled engine, but the currently enabled original account variant has not been visually compared. Appearance source-to-preview travel uses a reconstructed WAAPI snapshot transition; profile springs use CSS curves rather than the original Motion runtime. Intro ring spin/settle uses the extracted sample curve and Three.js geometry, with measured-rectangle stage handoffs. Notifications currently establish permission only; automated run notifications are not implemented. Local computer access and unsupported connectors remain unavailable, with honest disabled states. Real remote desktop keeps the local Linux apps and transport. The static onboarding screenshot must not be mistaken for a live view or proof that its illustrated apps are installed.

## OpenCode 2

Provider added to status/settings/model catalog, task dispatch, screen analysis and usage display. Installed OpenCode v2.0.32 is detected. Each run uses an isolated temporary config and current-run MCP bridge; host tools/integrations are denied and only the existing OhMyDots tool list is enabled. Cancellation kills the process group. GoalLoop sessions and outcome validation follow existing runtime behavior. Invalid model/account responses produce actionable errors without leaking raw credential details.

Validated with fake-CLI integration tests and a real OpenCode local MCP handshake. Prior real model probes were rejected by account/model entitlement (403/400), so successful production model inference is not claimed. Existing selected provider/model were preserved during UI QA.
