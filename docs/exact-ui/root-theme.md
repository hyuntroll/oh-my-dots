# Root attributes, theme and Dots navigation contracts

Artifact: installed app.asar SHA-256 `5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869`. These findings are static source observations, not a claim that every branch executed in the original application.

## Electron root

In `webview/assets/app-initial-dddef47d6ef6.js` at source character 13,211,004, initializer `YJu` sets:

```js
document.documentElement.dataset.codexWindowType = 'electron';
document.documentElement.dataset.windowType = 'electron';
document.documentElement.dataset.codexOs = os();
document.documentElement.dataset.codexWindowChrome = Nwe('electron', os());
```

Imported `os` maps to `shared.cst` (`CQ`) and reads `navigator.userAgentData.platform`, then `navigator.platform`, normalizing Mac/Darwin to `darwin`, Windows to `win32`, Linux to `linux`. Imported `Nwe` maps to `shared.lst` (`Bgt`): Electron on Darwin/unknown uses `native` chrome, Windows/Linux use `application-menu`. Electron root values therefore were not browser guesses; the extra `codexWindowChrome` attribute was missing from the first host.

## Original theme generator

Original `MHl` theme provider begins at character 11,907,914. Its theme/color setup is required in addition to loading CSS. Relevant exports and internals:

| Original symbol | Public alias or local exposure | Purpose |
| --- | --- | --- |
| `yss` | `initial.Nbt()` | Initializes original palette generator and defaults |
| `Wos` | `initial.Mbt(settings, variant, effectiveChatTheme?)` | Resolves original Electron theme seed |
| `qos` | Derived exposure `initial.ExactApplyThemes` | Sets `data-theme`, generates both palette variable sets, calls original stylesheet injector |
| `UFn` | `shared.NC(document, variables)` | Writes `style[data-codex-app-themes]` in the theme layer |
| `Nq` | `shared.Sut()` | Initializes original appearance settings descriptors |
| `Mq` | `shared.xut` | Appearance settings descriptor/defaults object |

The immutable original bundle does not export `qos`; the server appends an explicitly labeled export to its served derivative without changing any function body or the preserved source file.

`exact-host/theme.mjs` calls those original functions. It does not contain reconstructed palette hex values. Its font-token map is copied from original `MHl`/`KHl`, scaled by the original default `sansFontSize`: default UI 14px, code 12px; 4xl 72px, 3xl 48px, 2xl 36px, xl 28px, lg 16px, base 14px, sm 13px, xs 12px, dynamic island row 14px; heading large/app/medium/small 24/28/20/18px. Thus loading only shared CSS (whose base `sm` is 12px) misses runtime overrides.

`HHl` is hardcoded false in this artifact. Default UI font selection consequently uses the system font rather than OpenAI Sans, despite its font files and a true `useOpenAISans` settings default being shipped. Default Darwin font smoothing is enabled. Pointer cursor preference defaults false. Original theme preference defaults `system`.

Original root `dGu` sets `data-reduced-motion` to `String(!animationsEnabled || reducedMotion)`. Shared private `S8t` resolves the persisted reduced motion preference: off→false, on→true, system→media match. The host adapter mirrors those default-on animation semantics, preference and media listener. The original Intl `$Ot` provider handles locale-dependent formatting; no separate date initializer is needed for the investigated components.

## Original Dots navigation

The multi-profile navigation is in the same original initial bundle:

- `B8c({item})`: original profile list. It reads profile selector `wJn`, passes profiles through the original `akc` expanding list (`maxItems: 5`, reveal-all on expansion, active profile forced visible), and renders `H8c` rows.
- `H8c({item, profile})`: original row; label, avatar, unread count, paused state, activity disclosure, context menu and route behavior.
- `q8c()`: initializes list/row dependencies.
- `J8c({orbitDestination, sidebarMode})`: section wrapper combining original new-chat navigation and single- or multi-profile navigation, selected by feature state `fw`.
- `Csc()`, initialized by `wsc()`: computes the original “Your dot” navigation item. This is an item model, not a standalone full sidebar DOM component.

These symbols are private; an exact host can expose them on a clearly labeled served derivative. `B8c`, `H8c` and `J8c` are not existing public ESM exports. Rendering `J8c` also draws in general application sidebar behaviors and more state; it is not a dependency-free shortcut.

Existing public data exports:

| Original symbol | Public alias | Contract |
| --- | --- | --- |
| `TJn` | `initial.Pur()` | Initializes cloud profile catalog/query and list selector |
| `pE` | `initial.Nur` | Catalog query, key `['cloud-aeon-profiles', accountId, userId]` |
| `Fw` | `initial.E_r` | By-ID profile query, key `['cloud-aeon', accountId, userId, id]` |
| `Iw` | `initial.D_r` | By-thread profile query, key `['cloud-aeon-by-thread', accountId, userId, threadId]` |
| `kC` | `initial.lbr` | Per-thread saved appearance selector |
| `iw` | `initial.Uvr` | Profile catalog eligibility flag |
| `eg` / `tg` | `initial.zRr` / `initial.BRr` | Account/user identity selectors |
| `fw` | `initial.wvr` | Multi-profile navigation feature state |

Catalog endpoint is `GET /tbo?cursor=…&limit=25&include_room_preview=false`, paged until cursor is null. Fields directly read by the row/list: `id`, `display_name`, `active_root_thread_id`, `is_paused`, and `status`. Profiles with status `deleting` or explicit denial/deletion state are filtered. Row destination is `/dots/${encodeURIComponent(profile.id)}`. The active root thread supplies the avatar identity. Avatar appearance is stored separately under the per-thread appearance selector, so local preset data must be adapted there rather than only copying `profile.preset`.

Existing host providers cover much of the basic dependency boundary: app scope `J`, Intl and router. Original rows additionally read unread/activity/appearance selectors and actions; they require real local query/cache and service adapters before all interactions can work. Static source establishes these reads, not a successful runtime mount.

## Original Korean messages

`ko-KR-8a007bddadf3.js` default export is a flat message-ID to Korean string object, initialized by its own module. It includes the restricted Dots/onboarding messages and can be passed directly to original Intl `$Ot` with `locale: 'ko-KR'`.

`ko-968eacb21091.js` has no ESM exports. It registers component string loaders as side effects, and is not the main Intl message object. Both files are included as exact extraction roots. No Korean translations were authored by the host.
