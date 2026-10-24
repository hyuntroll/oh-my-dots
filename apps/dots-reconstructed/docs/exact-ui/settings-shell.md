# Original Settings shell and local route boundary

Static evidence is from the current shipped artifact `/Applications/ChatGPT.app/Contents/Resources/app.asar`, SHA-256 `5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869`. The immutable copy of `webview/assets/app-initial-dddef47d6ef6.js` in `public/original/` was parsed with the pinned Babel parser. Character offsets below refer to original unformatted module strings. This investigation did not run or inspect the installed application, read account stores, or use an Inspector. Browser QA belongs to the parent agent; static inspection does not establish runtime success.

## Exact entry and nesting

`settings-page-20e2bed110da.js` exports `SettingsPage` (`yi`, character 41,856). Its module calls its own `Di()` initializer. This is a complete routed page: original search/navigation sidebar, original settings layout, pending-navigation dialog and nested router outlet. It is not a standalone Settings modal.

The original initial module also exposes this entry through its existing lazy component:

| Original symbol | Existing export / candidate | Evidence and role |
| --- | --- | --- |
| `yPl` | `initial.PF()` | Character 11,738,891. Initializes lazy `SettingsPage` import. |
| `vPl` | `initial.NF` | Lazy component importing the actual `SettingsPage` export. |
| `tNs` | `initial._ft()` | Character 8,664,879. Initializes section metadata. |
| `eNs` | `initial.hft` | Array of `{slug, appRoute?}`. Includes all original settings section slugs. |
| `QMs` | `initial.mft` | Default section slug `general-settings`. |
| `nUs` | `initial.wct()` | Character 8,860,692. Initializes the actual lazy section component registry `tUs`. |
| `f8` | expose as `ExactSettingsSection` | Character 11,740,281. Actual route content wrapper; props `{slug}`. Retains original section error boundary and redirect behavior. |
| `PPl` | expose as `ExactInitSettingsSection` | Character 11,741,319. Initializes `f8`, original error boundary, usage aliases and registry. |
| `bPl` | private, optional | Character 11,739,300. Prefetches the selected section and renders `vPl`. Rendering `NF` directly preserves the same page. |
| `TPl` | private, optional | Character 11,739,683. Initializer for `bPl`. Needed only if exposing that convenience entry. |

Minimal export-only HTTP additions, without altering original function bodies:

```js
export { f8 as ExactSettingsSection, PPl as ExactInitSettingsSection };
```

`exact-host/local-settings.mjs` exports `createOriginalSettingsRoutes({initial, React, jsx})`, returning an array containing the `/settings` parent route. It renders original `initial.NF`, with children rendered by original `f8`. The module contains route data and service subscriptions only; no recreated settings markup, labels, CSS or controls. It deliberately leaves `/profile` to the separate original profile route scope. Original metadata has `{slug:'profile', appRoute:'/profile'}`.

For a provider root shared by Dots, Settings and other routes, original router `Outlet` is `shared.CSt`, initialized by existing `shared.NSt()`. Put this Outlet inside the existing scope/auth/Intl/query/ResizeObserver provider tree and `CaptureScope`; put the settings route and original Dots fallback route under it. Rendering only a new settings route next to the existing catchall provider route would omit the application contexts.

The original route registration in initial uses `/settings`, an index redirect to `/settings/general-settings`, and children from `eNs`. Plugins use `plugins-settings/*`. Aliases include `computer-use/:browserFamily`, browser subpages, connection subpages, cloud-environment descendants, code-review repository details and team details. The local factory includes these section aliases. Its index renders the original general section; the parent may retain the original index redirect using original `shared.SSt` Navigate.

## Existing providers and original shell

The root needs the same application scope, query client, local AuthProvider, original Intl, original Router and ResizeObserverProvider already installed for Dots. Keep an original RouteScope (`initial.MOr`) around the Outlet with the current location. Settings is not a thread route. The top-level route state may leave `persistentWorkspace` absent; original shell adds its settings workspace header when `persistentWorkspace?.key === '/settings'`.

`SettingsPage` uses `initial.sI` = original `wNl` at character 11,700,858. This composes original `yDl` with `contextualNavigation: originalSettingsSidebar`, and therefore already includes original navigation/workspace shell. Do not wrap SettingsPage in another `FR → IR` shell.

The settings sidebar comes from actual `Hr → Ur → Wr` in the settings-page chunk; `Wr` starts at character 22,365. It supplies the original groups, icons, search, result navigation and selected states. The original `Outlet` receives:

```js
{
  visibleSettingsSections,
  showEnterpriseUsageLabel,
  onClose,
  onSelectSection,
  restoreUsageTabFocus,
}
```

Actual section modules obtain this context from the page. A standalone section mount can omit its needed navigation context even though its import succeeds.

## Section roots and local visibility

The full registry is an AST `AssignmentExpression` to `tUs` inside `nUs`. These are the most relevant explicit extraction roots; global initial's dynamic imports are intentionally not all followed by the existing bounded extractor:

| Original section slug | Exact lazy module | Component export |
| --- | --- | --- |
| `general-settings` | `general-settings-ac26e93f0ea2.js` → `general-settings-f7eeb71e3831.js` | `GeneralSettings` |
| `appearance` | `appearance-settings-90f8e813006c.js` | `AppearanceSettings` |
| `account` | `account-settings-6840b590b4f0.js` | `ChatGptAccountSettings` |
| `personalization` | `personalization-settings-c24ed4573607.js` | `ChatGptPersonalizationSettings` |
| `plugins-settings` | `plugins-settings-94cd739d6862.js` → `plugins-settings-b85653a450be.js` | `PluginsSettings` |
| `notifications` | `notifications-settings-ae4e7656d8b8.js` | `NotificationsSettingsPage` |
| `keyboard-shortcuts` | `keyboard-shortcuts-settings-5dc755c08827.js` | `KeyboardShortcutsSettings` |
| `agent` | `configuration-panel-c6078bf0ff0d.js` | `ConfigurationPanel` |
| `git-settings` | `git-settings-4636ed082a3b.js` | `GitSettings` |
| `mcp-settings` | `mcp-settings-10c930dc25b4.js` | `McpSettings` |
| `hooks-settings` | `hooks-settings-c858c1de1dd5.js` | `HooksSettings` |
| `gateways` | `settings-660d7de134d3.js` | `GatewaysSettings` |
| `worktrees` | `worktrees-settings-page-ab2674b560ae.js` | `WorktreesSettingsPage` |
| `local-environments` | `local-environments-settings-page-a19a48cc34e0.js` | `LocalEnvironmentsSettings` |
| `data-controls` | `data-controls-settings-143658cc3008.js` | `ChatGptDataControlsSettings` |
| `archived-chats` | `data-controls-792dc8b72a85.js` | `DataControlsSettings` |

The section navigation visibility hook is `ro`, export `n`, in `use-visible-settings-sections-acca727feff5.js` at character 34,079. It is initialized by export `t` (`po`). It deliberately applies product capabilities, selected host, auth method, feature state and loading/error state. Examples established by its actual switch:

- General, appearance, personalization, keyboard shortcuts, MCP and hooks are intrinsically visible; product category capabilities still apply where specified.
- Plugins visibility uses original plugin capability `Lpr({hostId})`, plus `codexOrWorkLocal` category capability.
- Account visibility requires original ChatGPT auth methods (`chatgpt` or `chatgptAuthTokens`) and ChatGPT category capability. A truthful `authMethod:'local'` therefore hides it by default.
- Notifications similarly requires the ChatGPT capability and an allowed account policy state.

Do not silently claim ChatGPT authentication to expose local UI. A separate explicit local capability/visibility boundary, if needed by the parent, should remain a declared porting choice. Reusing page assets alone does not establish that cloud-only sections will be visible or usable.

Selected settings host comes from existing `initial.oat` (`nZs`, character 8,984,836): route `/settings/plugins-settings/hosts/:hostId/plugins/:pluginId`, then `?hostId=`, then local persisted selection. Its result is `{connectedRemoteConnections, selectedHostId, setSelectedHostId}`. The ordinary local fallback is original host ID `local`. Remote connections can truthfully be empty.

## Minimum local service contract and live theme

The original settings query `shared.fit` (`g1`) is initialized by `shared.oit()`. It calls `rpc.appServices.settings.readAll()` when supplied, otherwise original native `get-settings`. Key is `shared.bit('get-settings')`.

```js
settings.readAll() // Promise<{values: Record<string,unknown>, configuredValues: Record<string,unknown>}>
settings.read(key) // Promise<{effective: unknown, configured: unknown}>
settings.write(key, value) // Promise<{effective: unknown, configured: unknown}>
settings.subscribe(key, listener) // Promise<{[Symbol.dispose](): void}>
// listener receives {effective, configured}
```

The existing local adapter implements this in its own metadata namespace. In original `shared.oit`, subscription callbacks update original query data `values[key]` and `configuredValues[key]`; therefore actual local writes and subscriptions must be kept. Suppressing native errors without a local write would not preserve a setting after rerender/reload.

Appearance descriptor properties are not their persisted keys. Original `shared.Sut()` (`Nq`, character 1,698,794 in shared) defines `shared.xut` (`Mq`):

| Descriptor property | Persisted key |
| --- | --- |
| `theme` | `appearanceTheme` |
| `lightChromeTheme` / `darkChromeTheme` | `appearanceLightChromeTheme` / `appearanceDarkChromeTheme` |
| `lightCodeThemeId` / `darkCodeThemeId` | `appearanceLightCodeThemeId` / `appearanceDarkCodeThemeId` |
| `diffMarkerStyle` | `appearanceDiffMarkerStyle` |
| `sansFontSize` / `codeFontSize` | same as property |
| `useFontSmoothing` / `usePointerCursors` | same as property |
| `reducedMotionPreference` | `reduced-motion-preference` |

`local-settings.mjs` exports `originalThemeSettings(shared,values,defaults)` to map these actual keys to the existing theme adapter's property names. Its async `connectOriginalSettingsTheme({initial,shared,settingsService,initOriginalTheme,initialValues,currentTheme,onTheme,onError})` installs own service listeners, reads actual local values, disposes previous theme media listeners and invokes the original theme adapter again. It returns `{theme getter,refresh,dispose}`. Register this once after local adapter creation; keep its disposer with the adapter/root lifecycle. `onTheme` can replace `diagnostics.theme`. This does not alter original settings components or original theme functions.

Account UI statically references `/profiles/me`, `/accounts/users/name`, policy and change-email endpoints; personalization references original system-message/personality/account-user-setting endpoints. Native/platform setting rows also depend on actual local app services. These are additional data contracts, not an instruction to fetch a real account. The parent adapter must provide truthful local profile/preferences and unavailable behavior for unsupported operations. No such cloud operations were executed in this investigation.

## Verification status

- Original entry, section registry, nested route/props, visibility inputs and persisted descriptor keys: answered by bounded AST/static inspection.
- `exact-host/local-settings.mjs`: `node --check` passed.
- New Settings/Account/Plugins interactions, local persistence and full visual parity: require parent-controlled localhost browser QA. No runtime success is claimed by this document.
- Common bootstrap, server, local-adapter, original asset bytes and installed application were not edited by this worker.

## Parent integration and browser QA

The host now exposes a labeled `ExactAdaptSettingsVisibility` setter on the original visibility-hook module. `installLocalSettingsVisibility` explicitly declares the port's seven local section capabilities while retaining the original metadata, sidebar and content components. This is a local UI capability boundary, not ChatGPT authentication. The local `/me`, `/profiles/me`, `/wham/profiles/me` and name-patch contracts expose only the local browser profile. No native account store is read.

On isolated UI 3426 the parent verified Settings entry, search, original appearance controls, immediate light/dark application and reload persistence, account name edit/reload, Meta-comma navigation and return to app. The usage route retains the original title and uses the original `YEn` empty-state primitive to explain unavailable local usage, rather than displaying fabricated quotas. Screenshot: `docs/qa/exact-ui/settings-appearance.png`. Native platform controls, authentication, cloud memory and billing are outside the UI wiring.
