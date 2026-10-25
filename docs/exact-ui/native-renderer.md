# Original native character editor — 2026-10-25

Artifact SHA-256:
`5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869`.
This is static source evidence; successful browser rendering remains a separate
runtime check. No native application runtime or account storage was accessed.

## The welcome ring is original

`webview/assets/page-a0db2051c101.js` function `Ko` renders the original
onboarding ring. It invokes `Jo`, which lazily imports
`orbit-introduction-logo-renderer-13f7b5fda6bb.js` and Three.js. A gray spinning
ring on this screen is not evidence that the face-character WASM editor fell
back. The original `Es` CharacterScope maintains an offscreen WASM instance to
obtain its color catalog; the visible welcome ring is a separate original
renderer.

## Why the 12-button chooser appeared

`aeon-appearance-picker-ca7647885a88.js` low-level function `lt` selects the
native CharacterEditor only when `characterConversationId` is present and the
original legacy selector is false. Otherwise its original legacy grid shows
12 SVG avatar choices.

The original bound wrapper `gt` supplies `characterConversationId` only for
the original durable execution-host product mode. Its helper `aS` classifies
the literal host ID `durable` as durable. Calling this wrapper with execution
host `local` therefore selects the legacy UI even if the profile says
`aeon_kind: orbit`.

The public original setter `initial.Ber(scope, threadId, 'durable')` (`pcr`)
sets the thread's explicit execution-host mapping. `initial.Fer` (`yk`) reads
this mapping first. The local adapter uses this original product-mode contract
for real locally persisted Dot threads; all actual operations still terminate
at the local adapter and its original auth method remains `local` with no
cloud token.

The original legacy selector `initial.D9` (`Tac`) also reads a persisted orbit
identity marker for local threads when `codex-app-side-orb-enabled` is enabled.
Its original marker key is:

```js
'aeon-is-orbit-v1:' + JSON.stringify([
  localAccountId,
  { hostId, threadId },
])
```

`initial.BLr(key, true)` is the original persisted setter. These markers live
inside the isolated host's own snapshot namespace. The adapter marks the
actual local Dot profiles, rather than impersonating an OpenAI account.

## Actual WASM frame contract

`initial.f9()` returns the shipped frame URL:

```
./assets/orbit-character-a46c99f7e8749621/fd5f2a1997e55d5f/frame.html
```

The original `initial.Z7` preview and native CharacterEditor use this same
frame through their original postMessage client and optional retained-frame
provider. The frame is same-origin, sandboxed with `allow-scripts
allow-same-origin`, and uses no Electron appHost method to run the engine.

The frame's own `frame.mjs` chooses threaded runtime only when
`crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'`. Otherwise it
imports `../runtime/single-thread/orbit-characters.mjs`, with its real `.wasm`
and `.data` files. The original code already contains this fallback; changing
the character widget to an imitation is unnecessary.

Frame input must come from its parent with the same origin. A new presentation
requires real `Uint8Array` appearance state, boolean active/reducedMotion, and
an owner ID/requestReady handshake when retained ownership is used. The
original component handles those messages. The host must not synthesize them
to conceal a failed editor.

The isolated bootstrap only passively records safe loaded/ready/failed and
startup-stage metadata in `__DOTS_EXACT__.characterStatuses`. It does not change
the original frame lifecycle or transmit synthetic appearance state. Failures
should be resolved from those statuses and actual missing-resource/error
evidence before claiming native editor parity.

## Customize is an inline original editor

`editor-placeholder-4baf99496e70.js` renders the Customize option as an explicit
`type=button`. Its callback reaches the original CharacterEditor in
`editor-a8d5d6b79d1e.js`. That component's `onCustomize` restores the saved custom
state (or original `Wac` default) through the existing native client, then sets
its own mode from `chooser` to `custom`. The custom branch renders the original
`Je` feature tabs for body shape, eyes, eyewear and accessories in the same
dialog. It opens no window or separate editor route and requires no additional
appHost bridge. An entry-transition misclick should not be repaired by adding
an invented editor window.
