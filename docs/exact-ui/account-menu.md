# Original account/profile menu in local mode

Static evidence: installed `app.asar` SHA-256 `5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869`, original `app-initial-dddef47d6ef6.js`, `app-shared-fc3316d48427.js`, and bounded ASAR member `profile-dropdown-items-92ce6aadc70e.js` (52,143 UTF-8 characters). No installed-app runtime, native Inspector, user account store, token, subscription or usage record was inspected.

## Entry points and shell

`NOc` is the original sidebar footer. Its initializer is `ROc`; neither is publicly exported. Props are `{compact=false, defaultOpen=false, hideUsage=false}`. It keeps the original button, icon/avatar, sidebar width, loading placeholders and ambient usage label. It calls `EOc` with `{defaultOpen, hideUsage, hasAmbientUsageSubtext, sidebarFooter, triggerButton}`.

`EOc` is already public as `initial.S2`; initialize it with `initial.C2()` (`MOc`). It mounts the referral prefetch observer and `DOc`, the original controlled menu/popover shell. `DOc` chooses the original sidebar geometry from `sidebarFooter.width`: null gives the rail menu on the right; a numeric width gives the full footer menu above the trigger. `defaultOpen` only sets initial React state. `triggerButton` is cloned to attach original lazy-code prefetch handlers.

The shell lazily imports `profile-dropdown-items-92ce6aadc70e.js`, whose public `ProfileDropdownItems` is the live function binding `wa`. Its module initializer `Pa()` runs on import. Its props are `{accountSwitchReturnHref, sidebarFooter, ambientUsage, hideUsage, open, onClose}`. It normally reads numerous account, plan, referral, native setup and rate-limit selectors. In local mode those cloud selectors are unnecessary for rendering the actual menu layout.

For a non-ChatGPT auth method, footer helper `oOc(config)` uses `config.model_provider`, then looks up `config.model_providers[provider].name`. This is the original path for displaying a truthful local execution/provider label. The config query is public `initial.BRt` (`_X`), keyed by `{hostId: Do}`; it is not a user profile query. `sidebarFooter.profileIdentity` can independently carry `{displayName, profileImageUrl, isProfileAvailable, username}` into the menu. `authMethod:'chatgpt'` must not be set just to activate a profile/Pro visual branch.

## Required nonce provider

The profile items call `xr()` (`initial.nmr`), which calls `Lzn()` (`initial.omr`). `Lzn` reads private context `czn` and throws `useUpdateAuthNonce must be used within AuthNonceProvider` if the provider is absent. Initializing `initial.rmr()` does not mount a provider. `lzn()` initializes `czn = React.createContext(null)`.

The shipped provider `DWu` reads `wT.subscribeStatus`, `wT.identityKey` and resets native auth-related caches (`huo`, `hAt`). That provider is not needed for a local auth mode. The independent host should expose only the original context:

```js
export function ExactAuthNonceContext() { lzn(); return czn; }
```

`LocalAuthNonceProvider` in `exact-host/local-account-menu.mjs` supplies that context with a stable local refresh callback. It updates a local nonce and remounts local children with that key. Its optional `onRefresh` callback must refresh local data only. It never reads or resets the installed app's auth caches.

Mount it above the local auth/menu tree:

```js
React.createElement(LocalAuthNonceProvider, {
  React, initial, onRefresh: refreshLocalData, onError: report
}, localApplicationTree)
```

## Preserved original menu layout with local services

The profile module contains `ha`, the original full footer menu layout. It accepts `displayName`, `personalPlanLabel`, `accountIcon`, `accountSwitcher`, `identityItems`, `usageItems`, `workspaceInviteItem`, `additionalItems`, `hasWorkspaceAccount`, `isOverlayOpen`, `onCopyUserId`, `onOpenProfile`, `onOpenSettings`, `onOpenWorkspaceSettings`, `onOpenChatGptAnalytics`, `onTogglePet`, `onLogOut`, shortcuts, and profile trailing content.

`ha` renders the original header/subtext, separators, usage section, pet row, settings, help/additional section and logout row. It still reads the original config query to obtain the provider label and uses the original pet item `ga`. It therefore retains the original styling and icon primitives. Its exact slot order is `accountSwitcher`, provider label, header, `identityItems`, separator, `workspaceInviteItem`/workspace actions, `usageItems`, pet, `additionalItems`, optional profile row, Settings, separator, built-in Help (`aa` → `oa`), logout. `aa` renders Help even when its mobile/remote setup flags are all false. Supplying another Help in `additionalItems` duplicates it; placing the disabled invitation in that slot gives usage → pet → invite → settings → help → logout. `ea` is the original Help flyout and remains useful source evidence, but the adapter does not mount a second copy.

Expose only these additional symbols in a labeled derived module:

```js
export {ha as ExactAccountMenuLayout, Sr as ExactAccountAvatar};
export function ExactAdaptProfileDropdownItems(adapt) {
  const Original = wa;
  wa = adapt(Original);
  return () => { wa = Original; };
}
```

`installLocalAccountMenu(options)` swaps the original live exported item binding before the menu lazy import is used. It composes only original visual components: `ha`, the original avatar `Sr` (also public as `initial.oon`), `shared.ok` (original menu item), `shared.tkt` (original memoized formatted message), and original usage/invitation icons `shared.PS`/`shared.Su`. No authored HTML, CSS, icon or fake usage graph is added. The avatar uses a local name/user ID and its original fallback rendering; no installed account image is read.

Options:

- `React`, `shared`, `itemsModule`: the already initialized original modules.
- Optional `initial`: provides public avatar `initial.oon` if the profile module does not expose `ExactAccountAvatar`. Optional `accountIcon` accepts an already constructed original avatar element.
- `identity: {displayName, modeLabel}`: a local name and execution-mode label, default `Local`. The mode label is not a subscription; never supply the screenshot user's name or Pro plan from the installed application.
- `navigate(path)`: actual local router; settings `/settings/general-settings`, usage `/settings/usage`.
- `onOpenProfile()`: optional actual local profile route/action. Without it the original header remains disabled rather than opening an invented profile page.
- `onLogout()`: optional actual local session action. Without one, the original menu-row primitive displays a disabled logout item with a local-mode explanation; no cloud logout is claimed.
- `pet: {subscribe, getSnapshot, toggle}`: optional actual local pet visibility store/action. `getSnapshot` returns a stable boolean. Without it, the original `ga` pet row is displayed disabled; the adapter never pretends to show/hide a native floating pet. The host exposes `ga` as `ExactPetMenuItem` for this state.
- Optional `diagnostics`, `onError`.

The original Usage row opens local usage/settings; it displays no invented percentage, reset time or quota. The original invitation row remains visible but disabled with a local-mode explanation, since no local referral service exists. Workspace/cloud account actions are omitted. Help is the original built-in flyout; its URLs and keyboard-shortcut action remain governed by the original help component and host bridge/action service. No unsupported help route is invented by the menu adapter.

## Evidence status

The parent additionally exposes `ExactAdaptProfileFooter`, which initializes `ROc` and wraps the existing `NOc` binding. The local wrapper retains the original returned footer/popover/button and decorates its existing trigger icon/name slots with the original avatar and local name. This permits a local profile footer without setting `authMethod:'chatgpt'`. The original `vTn` settings shortcut selector supplies the menu's `⌘,` label; a local keyboard boundary performs the actual navigation.

Browser verification on isolated UI 3426 confirmed the menu avatar/name, item order, single Help flyout, shortcut, disabled pet/invitation/logout and profile/settings navigation. The original name-edit dialog saved a local name; both footer and dropdown showed it after reload. `docs/qa/exact-ui/account-menu.png` and `account-menu-detail.png` record the result. Actual pet overlay, cloud invitation and authentication/logout remain unimplemented and explicitly disabled.
