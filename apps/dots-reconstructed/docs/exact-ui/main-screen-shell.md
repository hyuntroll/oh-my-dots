# Original Dots main screen and full shell

Source: original `webview/assets/app-initial-dddef47d6ef6.js`, ASAR SHA-256 `5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869`. Character positions below refer to the unformatted original module. These are static source observations; runtime verification is owned by the parent agent.

## Exact full composition is already publicly exported

The original private `yDl` (character 11,587,700) simply composes these public pieces:

```js
initial.LR(); // DDl: initializes shell components and their dependencies

jsx(initial.FR, {                 // bDl: complete navigation shell
  children: jsx(initial.IR, {      // xDl: complete workspace/main shell
    children: originalDotsRoom,
  }),
});
```

`initial.FR` and `initial.IR` are actual existing exports. No new shell DOM, CSS, spacing, titlebar or sidebar reconstruction is needed to use them.

| Original symbol | Existing ESM export | Props / role |
| --- | --- | --- |
| `DDl` | `LR` | Initializer for the outer/inner shell group |
| `bDl` | `FR` | `{children, showCodexMicroHud?, contextualNavigation?}`; builds the original NavigationShell and original sidebar |
| `xDl` | `IR` | `{children, contextualNavigation?}`; renders original top controls and main workspace layout |
| `yDl` | private | Convenience composition `bDl` → `xDl` → children |
| `FJa` | private | Original outer NavigationShell with measured bounds, sidebar, footer/titlebar slots, page surfaces |
| `CPo` | private | Original workspace shell; consumes NavigationShell context and creates `AppShellLayoutMotionContext` |

The earlier `AppShellLayoutMotionContext is missing` error is expected when rendering only the room without this outer composition. `CPo` provides original `Bk.Provider` at character 7,572,634; the room's animation logic is intended to consume that provider. Supplying a guessed static object for the provider would bypass the original measurement and motion logic.

`bDl` source at character 11,587,986 computes the left-panel slot and invokes original `FJa`. The slot's `children` is original `lDl`, its appearance/minimum width/fixed width depend on original navigation state. `xDl` at character 11,590,176 invokes original `CPo` and contributes original sidebar-trigger/history-navigation/new-chat header actions, content slot and optional panel/voice surfaces.

## Full sidebar chain

The full sidebar has this source composition:

```text
bDl / FR
  FJa (NavigationShell)
    leftPanelSlot.children
      lDl ({desktopNavItemsEnabled:true, contextualNavigation})
        div#app-shell-sidebar (original classes, drag/drop handlers)
          dEl
            bEc / xEc (destination model provider, if absent)
            fEl ({destinations, desktopNavItemsEnabled, ...})
              original navigation chrome / search / profile / project / recent sections
              J8c for Dots/new-chat feature section
                B8c for multiple Dots, or w8c for a primary Dot
```

Relevant original source positions:

- `lDl`: 11,584,823. Creates `#app-shell-sidebar` and original layout classes; initializes via `mDl`.
- `dEl`: 11,560,083. Adds original destinations provider when missing.
- `fEl`: 11,560,349. Full sidebar UI, not only a Dot list. Its props are `desktopNavItemsEnabled`, optional `sidebarTriggerState` (default `app-shell`), `contextualNavigation`, and `destinations` from the provider.
- `bEc`: 9,934,271. Original destination provider wrapper; avoids duplicating itself.
- `xEc`: 9,934,600. Computes destination models from product mode, capability and feature state.
- `J8c`: 10,785,646. Combines original new-chat action with single- or multi-profile Dots navigation.
- `B8c` / `H8c`: multi-profile list / profile row, detailed in `root-theme.md`.

Do not replace this chain with hand-created left-column markup to claim original sidebar fidelity. Directly rendering `B8c` or `H8c` preserves rows only, while `FR` preserves the complete original shell.

## Required outer providers and local state

The existing host already supplies most required roots:

- Original app scope `J` through shared `Qst` provider, with the same query client used by the local adapter.
- Original Intl provider (`shared.$Ot`) with original locale messages.
- Original router provider, including `useLocation`/navigation behavior.
- Original local AuthProvider boundary, supplying local identity rather than real cloud credentials.
- Original RouteScope `tb`, exported `initial.MOr`.
- Original ThreadScope `Ly`, exported `initial.QOr`.

`FR` creates its own navigation destination provider as necessary and its own NavigationShell context. `IR` creates the layout motion context. Do not hand-create those contexts when the original components can supply them.

The original current route/location atom is `HE`, public `initial.Ycr` (initializer `UE`). It stores the current router location, used for active destination and history state. Original navigation command atom is `CD`, public `initial.Air`, defaulting to throwing placeholder functions until host setup; the local bridge must supply real local navigation, `navigateToLocalConversation`, and `prepareNavigation` rather than swallowing clicks.

For a ready profile, original `hO` route upgrade at character 3,715,353 returns:

```js
{
  ...route,
  orbitId: profile.id,
  routeKind: 'local-thread',
  conversationId: rootThreadId,
  hostId: currentExecutionHost,
  projectContext: null,
}
```

The original Dots route template is `/dots/:id`; pathname is `/dots/${encodeURIComponent(profile.id)}`. ThreadScope separately carries `clientThreadId`, `routeConversationId`, and `orbitId`. Leaving RouteScope as `routeKind:'other'` loses some shell/header behavior even when the child room itself renders.

## Work versus Codex mode

The full shell intentionally responds to the original product mode selector:

- `EL`, exported `initial.skn`, initialized by `initial.okn()` (`DL`).
- `xEc` maps `EL === 'work'` to the `chatgpt` destination/sidebar mode, otherwise `codex`.
- `EL` returns Work when original effective detail mode `DJt/Uqt` is `STEPS_PROSE`, or when there is no configured detail mode and the original onboarding role classifier resolves non-coding.
- `Eoe.conversationDetailMode` is public `shared.Mlt.conversationDetailMode`; initialize its descriptors with `shared.jlt()`. Its persisted configuration key is `conversationDetailMode`, default `STEPS_COMMANDS`, enum `STEPS_PROSE | STEPS_COMMANDS | STEPS_EXECUTION`.
- Original mode-changing function `xJt`, exported `initial.QAr(scope, detailMode)`, sets transient original preference `Vqt` and writes the original setting. It does not invent sidebar layout.

Original settings query is `shared.fit`, initialized by `shared.oit()`. Its query key is computed with `shared.bit('get-settings')`. Data shape is:

```js
{
  values: { conversationDetailMode: 'STEPS_PROSE' },
  configuredValues: { conversationDetailMode: 'STEPS_PROSE' },
}
```

Original `shared.cit(scope, descriptor, value)` (`Cxt`) updates a cached setting; native setting changes use the original mutation path and local host service adapter. Implement an actual local setting operation if using the mutation, because suppressing failed writes will restore the previous original state.

A capability restriction also matters: `Hqt` forces coding mode when original Work capability `c_` reports `denied/unsupported-auth`. `c_` is public `initial.KIr`, combining cloud/local Work capability inputs. Original cloud policy will not recognize a new local auth method automatically. The local port needs an explicit truthful local capability adapter; changing local identity to claim real ChatGPT authentication would misrepresent the backend. Account/feature claims and backend capability must remain distinct.

Other original visibility gates: monothread/rail state `jE` (`initial.Ulr`) depends on feature `3085093835` and Work capability; multiple-Dots flag `fw` (`initial.wvr`) requires `2929219922` and named `aeon-cloud-mode` gate. A visible empty Codex sidebar can therefore be a state-adapter issue rather than a missing UI component.

## Native chrome and optional surfaces

`FJa` uses original native-safe header inset hook `Kqa` (`initial.v9t`). Its source supports Darwin legacy/modern left insets, application menu mode, and window-controls overlay measurement. Keeping the original root OS/chrome attributes and original measurement path preserves this behavior; a browser host still cannot supply a real native macOS titlebar through CSS alone.

The inner shell always references the lazy original `realtime-voice-launch-surface-476127c4991a.js` wrapper. It has now been added as an explicit exact extraction root. The optional voice, application menu, native drag/drop and external navigation operations still require corresponding local service support or honest unavailable behavior. Loading the original surface is distinct from implementing its service.

No app, server or bootstrap source was edited by this shell evidence pass.

## Why the original full shell can show no Dots item

`ZTc` calls `Csc()` and appends its result whenever non-null, independently of Work/Codex mode. A missing Dots entry therefore does not establish missing sidebar markup. `Csc` returns null when `Ssc` is false; `bnr()` in this artifact is hardcoded false.

`Ssc` first checks `sy({name:'orbit'}).isCapable`. The capability is backed by `eGt`:

- `eGt` is public `initial.Fjr`.
- Generic capability selector `sy` is public `initial.tjr`.
- Account ID must be non-null.
- `Vg`, public `initial.bLr`, reads `authenticatedUserId` from the auth input, and must be non-null.
- Native account input subscription must not report an error. `zh`, public `initial.Qzr`, is true when original `pEt === 'error'`. This can override a correctly seeded account query.
- `Yg`, public `initial.lLr`, must be a successful original account query whose data has `accounts[accountId].account.tbo_config.tbo_available === true`.

After capability is ready, multi-Dot flag `fw` (public `initial.wvr`) immediately allows `Ssc`. This flag combines original feature flags `2929219922` and the exact named key `codex-app-aeon-cloud-mode`. The original `kv('codex-app','aeon-cloud-mode')` simply joins with `-`; it is not a hash. The public original feature selector is `initial.uBr`.

A bounded runtime diagnostic can inspect only these booleans/capabilities without dumping account data:

```js
({
  mode: scope.get(initial.skn),
  orbit: scope.get(initial.tjr, { name: 'orbit' }),
  orbitPolicy: scope.get(initial.Fjr),
  accountSubscriptionError: scope.get(initial.Qzr),
  multipleDots: scope.get(initial.wvr),
  multipleDotsGate: scope.get(initial.uBr, '2929219922'),
  cloudModeGate: scope.get(initial.uBr, 'codex-app-aeon-cloud-mode'),
})
```

The local adapter should fulfill the actual local input subscription and cache contracts or explicitly adapt this capability boundary. It should not change the original sidebar's component tree or claim a cloud account is authenticated.
