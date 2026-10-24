# Original renderer host investigation — 2026-10-25

Target: `/Applications/ChatGPT.app/Contents/Resources/app.asar`, SHA-256
`5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869`.
These observations describe this artifact, not the October 18 build previously
used for the React reconstruction. Inspection was read-only with the installed
`@electron/asar` parser. No original application runtime was attached or launched.

## Implementation boundary

`exact-host/bootstrap.mjs` is an isolated host of shipped React components. It
uses the shipped React, JSX runtime, ReactDOM, state scopes, IntlProvider,
QueryClient, CSS and native engine. It contains no equivalent screen markup.
Its error output is host diagnostics. Merely reading these modules does not
prove that rendering or interactions work; those require localhost browser QA.

The original full entry `webview/assets/index-40a03cbe11dc.js` first imports
`rpc-94f5a75e4b1f.js`, then `app-main-246745df4c14.js`. The latter initializes
`app-initial-dddef47d6ef6.js` export `e_` and awaits export `t_` to obtain the root.
That full root awaits Electron RPC services and execution host setup and mounts
unrelated application features. The isolated host deliberately uses exported
feature components without that full root.

## Actual component entries

| Module under webview/assets | Export | Purpose |
| --- | --- | --- |
| `room-view-fe0c1087e5e0.js` | `AeonMessagingRoomView` | Original conversation room |
| `side-panel-5865710eeb11.js` | `OrbitMessagingSidePanel` | Original floating profile/activity side panel |
| `aeon-onboarding-ad5bab6d4da0.js` | `AeonOnboarding` | Conversation introduction, not the creation wizard |
| `aeon-appearance-picker-ca7647885a88.js` | `r`, initialize `n()` | Original low-level appearance dialog, avoids cloud save wrapper |
| `page-a0db2051c101.js` | `OrbitPage` | Original complete Dots landing/onboarding route, including account gates |

The small original creation-screen components are lexical symbols inside
`page-a0db2051c101.js`; its existing `Dc()` initializer initializes them.
The asset server can append an export-only shim to the served response while
keeping the extracted original source bytes unchanged:

```js
export {
  Gs as ExactWelcome,
  Ns as ExactSteps,
  ds as ExactCreating,
  Es as ExactCharacterScope,
  rc as ExactCreationController,
  Ja as ExactComputerSetup,
  ns as ExactConnectors,
  xs as ExactNotifications,
};
```

`ExactWelcome` accepts `accountId`, `userId`, `flowId`, `learnMoreUrl`,
`isContinuing`, `onContinue`, and optional `previewStage` (the value `welcome`
skips the birth entry for repeat-state inspection). Its body implements the
actual ring growth, native-character reveal, title/copy and primary control.
Null account/user IDs are used in the isolated proof; whether every account
query stays disabled must be verified in the controlled browser.

`ExactSteps({step, children})` calls `children(entered, logoRef)` and preserves
the original exit/entry transitions, logo flight, data-dot-anchor geometry,
presence ordering and reduced-motion behavior.

`ExactCreationController` is the original controller body `rc`, retaining its
welcome, connectors, notifications, creating, accepted, unknown and failed
branches and their original event handlers. `ExactComputerSetup` retains the
actual native-character appearance save and computer setup interaction. The
local host supplies the original controller with the local data adapter, and
uses its accepted profile/thread state to insert that original computer step.

`ExactCreating({entered, ref})` uses the original spinning logo and timed copy.
`ExactCharacterScope({accountKey,children})` maintains the original native
renderer/color-selection state, including an offscreen engine instance.

Do not label introduction-only rendering as complete Dots UI parity. The
room, profile, task details, composer and native computer viewer still need
their real data adapters and runtime verification.

## Original runtime/provider aliases

All shared aliases below are exports of `app-shared-fc3316d48427.js`:

| Alias | Meaning | Initialization |
| --- | --- | --- |
| `FBt()` | Original React module | Function returns the module |
| `LNt()` | Original JSX runtime | Function returns the module |
| `PNt()` | Original ReactDOM client | Function returns the module |
| `aCt` | ScopeProvider | `oCt()` |
| `sCt` | Scope query-client provider | `cCt()` |
| `Qst` | AppScope token | `$st()` |
| `$Ot` | IntlProvider | `ekt()` |
| `UCt` | TanStack QueryClient class | `WCt()` |
| `Ist` | TanStack React QueryClientProvider | `Lst()` |
| `$St(scope)` | Original scoped store hook | `ZSt()` |

Exports of `app-initial-dddef47d6ef6.js`:

| Alias | Meaning | Initialization |
| --- | --- | --- |
| `QOr` | ThreadScope (parent AppScope) | `lkr()` |
| `MOr` | RouteScope (parent ThreadScope) | `zOr()` |
| `zRr` | Current account ID state | Original auth state, no real identity seeded |
| `BRr` | Current user ID state | Original auth state, no real identity seeded |
| `U7` | Original avatar component | `W7()` |
| `_mr` | Auth context | `rmr()` |
| `Pw` | Original ResizeObserverProvider | `Fw()` |
| `FR` | Original navigation shell, including sidebar | `LR()` |
| `IR` | Original workspace/header shell | `LR()` |

The standalone host wraps `_mr` with an explicitly local auth context containing
null account/user IDs, no token and `isLoading: false`. This satisfies the
original `useAuth` context dependency without claiming a cloud login. The
TanStack React query provider and scoped query provider are distinct and both
must receive the same original QueryClient.

Additional export-only shims in the asset server expose the original root
contracts without copying their implementations:

* `ExactInitPersistedAtoms(snapshot,publish)` calls original `Ig()`,
  `ajt(snapshot,publish)`, `ojt(null)`. The host reads and writes only its own
  `dots-exact-persisted-v1` localStorage snapshot. It does not read the original
  native app's persisted atom store or `codex:persisted-atom:` namespace.
* `ExactNavigationBridge=bjs`, `ExactInitNavigationBridge=Ejs` preserve the
  original AppNavigationSignalBridge and its event handlers.
* `ExactLocationBridge=qfu`, `ExactInitLocationBridge=Xfu` preserve the original
  history/location/back-forward signal updates, including `HE`/public `Ycr`.

The local host keeps the original router in memory, wraps the product in the
original ResizeObserverProvider, and mounts the original navigation/location
bridges inside the prepared local AppScope before product content. Existing
room content is wrapped in original `FR → IR` shell components. Its RouteScope
uses `routeKind: local-thread`, the actual root `conversationId`, and local
host ID. This is necessary because the profile/appearance controls read the
original thread context and reject a non-thread (`other`) route.

The original `rpc-94f5a75e4b1f.js` exposes `setAppHost` and `setAppServices`.
They can be set to a local adapter; they do not themselves establish an
Electron bridge. Original cloud auth or another running app's account store
must not be imported to make the proof render.

## Host interface and required assets

Default asset base: `/original/webview/assets/`. The localhost server should
serve original relative imports and URL assets under this root. Its policy
should permit local same-origin requests and the original WASM workers, while
blocking unrelated remote requests.

CSS roots (with their original relative font/resource URLs):

* `app-shared-295ec67e1c5d.css`
* `app-initial-9d42883ac737.css`
* `app-primary-4d86db640757.css`
* `page-af6278188bd3.css` — required original ring canvas positioning; without
  this stylesheet ResizeObserver repeatedly expands the canvas. The host
  awaits all root stylesheets before mounting the original components.

JS roots:

* `app-shared-fc3316d48427.js`
* `app-initial-dddef47d6ef6.js`
* `rpc-94f5a75e4b1f.js`
* `page-a0db2051c101.js` with the export-only shim above
* The per-view entries listed in the component table

Preserve their static imports and lazy relative dependencies. A complete
package extraction is unnecessary if the host serves requested ASAR members.
Native-engine resources are also relative dependencies, not optional invented
avatar substitutes.

The HTML only needs a full-size `#root`; typography and product chrome should
come from the original styles/components. The bootstrap establishes original
`data-codex-os=darwin`, `data-codex-window-type=electron`, and
`data-window-type=electron` markers.

The current host loads the ordered original CSS closure from
`/original/exact-styles.json` and awaits it before mounting. `theme.mjs`
initializes the actual original color/theme functions and source-defined font
sizes. The default Korean messages come from the shipped
`ko-KR-8a007bddadf3.js` dictionary, not a rewritten translation.

`window.__DOTS_EXACT_CONFIG__` optionally supplies `assetBase`, `view`,
`appServices`, `appHost`, `onScope(scope, initial, shared)`, locale/messages,
and local callback/data values. The bootstrap does not read credentials.
`window.__DOTS_EXACT__` exposes phase/errors and the live original scope for
controlled debugging. Supported views: auto (default), wizard, welcome,
creating, introduction, appearance, room. Auto follows existing local profile
data into the original inner room; when empty it uses the original creation
controller. An explicit wizard retains the original one-primary-Dot guard and
does not pretend an existing catalog is empty. Complete creation QA therefore
requires a separate empty local backend data directory, preserving user data.

## Remaining gaps

* Runtime results belong in the parent verification notes after actual browser
  observation. Static inspection alone does not establish visual parity.
* The original creation controller `rc` combines welcome, connectors,
  notifications, creation, unknown-result recovery and computer setup. It
  requires local replacements for its cloud/auth contracts. The host now
  wires this controller to `local-adapter.mjs`; runtime QA of the whole flow
  must distinguish a rendered screen from a verified working interaction.
* `ns` is the original connector step and `xs` the notification step; their
  UI is mixed with cloud query and native permission effects. Exposing them
  requires truthful local service implementations, not fabricated success.
* The prior app's hand-built React components are not evidence of matching
  original screen geometry or interaction behavior.
