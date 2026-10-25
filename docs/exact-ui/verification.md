# Original UI host: evidence and verification

The earlier `client/` frontend was a handwritten reconstruction. The `exact-host/` frontend instead executes components from the installed artifact. Source baseline: `/Applications/ChatGPT.app/Contents/Resources/app.asar`, SHA-256 `5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869` (626,349,077 bytes), inspected on 2026-10-25 Asia/Seoul.

Immutable extracted bytes live in `public/original/`. `npm run original:verify` verifies every manifest member. The HTTP host appends explicitly documented exports/initializers to derived JavaScript responses and applies one bounded response-only patch to the product-mode heading: the ChatGPT Work/Codex switcher is removed and its label becomes `OhMyDots`. The original files on disk remain unchanged. The HTML entry is redirected to the local bootstrap. Local account, data, settings, execution-manager and messaging transport adapters are intentionally new implementations.

## Observed in the local browser

- Original Korean welcome screen, original page layout, copy, icons and Continue control render with the shipped CSS. Missing page CSS was identified and included before mounting; it had caused runaway canvas sizing.
- Original creation controller transitions from welcome through connector selection, creates an actual local profile and room, presents the original computer setup choice, and enters the original room. Empty local connector catalogs do not invent an OAuth connection.
- Original room renders actual persisted local message history, original composer and original message actions.
- Sending through the original composer creates a real SQLite task. The initially configured `opencode-go/longcat-2.5-preview-free` returned `provider.no-route`; this was a real provider error, not a UI failure. The local setting was changed to `opencode-go/beam-free` after a real CLI probe succeeded. A subsequent original-composer message received a real assistant response, persisted as task `60dca8ad-5ba7-4987-aea8-5d3498e07878`.
- Original navigation, sidebar profile switching, profile/activity/output panels, and appearance editor work with local records. The shipped native WASM editor produced a custom pink rounded triangle; its native state and PNG snapshot persisted and reloaded in the profile, header and sidebar. A legacy avatar ID had overridden the native selection; interactive avatars now omit that conflicting legacy ID.
- Original approval controls granted a real write request. Task `82943f2a-80b7-4354-b07f-56cb988dba59` wrote and read `ui-check.txt`, then persisted a real final model response. The original output tab displays the exact saved text `원본 UI 도구 연결 확인`. The original WebFetch binary download boundary is adapted only for actual same-origin local artifact/avatar resources, retaining Response/Blob and cancellation behavior.
- The original computer panel displayed the actual 1280×960 isolated local desktop. Its original takeover/return buttons changed actual ownership epochs. Keyboard input changed the desktop; a first right click after takeover opened the remote Chromium context menu. The test ended with owner `AGENT`. All local Dots currently share this desktop.
- Final automated run: 47/47 tests passed, including host path/proxy isolation, native avatar storage, computer ownership/input transport, and pause/resume. A real preparation race was fixed by publishing `in_progress` only after the task workspace exists and checking cancellation before provider launch. Frontend typecheck/build passed. `original:verify` checked 1,135 immutable files, 77,219,548 bytes. These checks do not establish pixel parity of the original UI host.

## Settings, account menu and Plugins UI follow-up (2026-10-25)

The requested account/footer dropdown now uses the shipped `ha` menu layout, original avatar, menu rows, shortcut display, Help flyout and original popover. The local identity adapter decorates only the existing footer trigger's avatar/name slots; it retains its original button and popover geometry. Name editing uses the original account page/dialog and persists only the local browser profile name. Local mode is explicitly labeled; no Pro plan or percentage was copied from the user's reference image. Pet overlay, invitation and logout rows are visible and disabled when their actual local services are absent.

The shared provider route now has an original Router Outlet. The actual original SettingsPage owns its own settings sidebar/shell and nested original section components. A documented local visibility boundary exposes general, appearance, account, personalization, keyboard shortcuts, usage and plugins without claiming ChatGPT authentication. Settings search and Meta/Ctrl-comma navigation work. Original theme controls update the original palette immediately and persist across reload. General native platform options are UI controls; the browser host does not implement a macOS menu-bar application or OS preference changes.

The original Plugins page uses its original app shell, Plugins/Skills header, search, Public/Personal tabs and Manage navigation. The original plugin management page settles into `연결된 MCP 서버가 없습니다`; Personal settles into `플러그인이 없습니다`. The Public inventory is also empty. Read-only local inventory/config query boundaries prevent an infinite loading state; they do not read the installed app's plugin directories or native settings. No preview catalog, installed/connected plugin, OAuth success or install operation is invented. Usage retains the original page header and an original empty-state component explaining that this local account has no connected usage information.

Browser QA used an isolated profile/database on API 3416/UI 3426. Verified opening the menu, original item order and disabled states, editing/reloading the local profile name, settings search, keyboard shortcut, light/dark theme and reload, return-to-app navigation, Plugins tabs and management empty states. Screenshots are `account-menu.png`, `account-menu-detail.png`, `settings-appearance.png`, `plugins-directory.png`, and `plugins-management.png` in `docs/qa/exact-ui/`. New route/controller checks are browser evidence; the existing 47 passing tests cover backend/host/character/computer contracts, not every new UI interaction. Build and typecheck passed. Expanded immutable extraction: 1,479 files, 82,727,116 bytes, all hashes verified, zero missing dependencies.

## Limits

Computer Use declined access to the installed application's own UI. No alternative tool was used to bypass that boundary. Static extraction and localhost execution continue, but an automated side-by-side screenshot comparison with the running original is unavailable. Original code/assets executed locally are stronger evidence than handwritten approximations, but not a claim of complete UI/UX parity.

Original cloud scheduling, memory, model policies, remote computer services and account integrations have not been recovered. Unknown local service requests fail explicitly. Original connector and computer states must correspond to actual local capabilities; no successful original-cloud operation is fabricated.

## Reproducibility

```sh
npm run original:extract
npm run original:verify
npm start
```

`DOTS_EXACT_PORT` selects the UI port; `DOTS_EXACT_API_PORT` selects its loopback API. `DOTS_DATA_DIR` can isolate test data. QA used separate databases on ports 3412/3413; existing profile/history data on 3410 was not reset.

`npm start` now launches the original UI at `http://127.0.0.1:3420/original/webview/`; the helper starts/reuses its matching API. The earlier handwritten frontend remains available explicitly with `npm run legacy:start`. Desktop startup is `npm run computer:start`; merely viewing status never starts it or takes control.

Remote packaging verification on 2026-10-25 pinned the extractor's ASAR and parser dependencies in the lockfile, removed personal npm-cache paths, and reproduced all 1,135 file hashes and the CSS ordering into a fresh output directory. The Vite development dependency was updated to 8.3.5 after the registry audit identified advisories in the previous version; the resulting dependency audit reported zero findings. The original UI's component bytes were not changed by that tooling update. Private runtime databases, credentials, environment overrides, node_modules and build caches are excluded from Git.

The committed project was then imported at `apps/dots-reconstructed/` in a clean worktree of `hyuntroll/oh-my-dots`. From that independent copy, `npm ci`, `npm test` (47/47), `npm run build` and `npm run original:verify` all passed. Starting it on API 3415/UI 3425 with an empty local database rendered the original Korean welcome screen; `docs/qa/exact-ui/clean-checkout-welcome.png` records that browser result. The existing user's runtime data was not needed for this check. The temporary verification server was stopped afterward; the normal local UI remains on 3420.

Browser captures are in `docs/qa/exact-ui/`: `native-editor.png`, `approval-pending.png`, `chat-tool-complete.png`, `file-preview.png`, and `computer-panel.png`. Earlier failed provider attempts remain visible in QA history rather than being erased.

REA parent evidence: `ev_aea4ead6a40d52de06d739e63d2bc36bad410d133b1b4c05fcf63623fc18cde9`; summary evidence `ev_eb07a75c7d27cf44aefbf01193159713884b822e52ea20e4977a466a1289e909`. See `rea-summary-2026-10-25.json` and the scoped source contracts in this directory. Static evidence does not itself observe runtime execution.
