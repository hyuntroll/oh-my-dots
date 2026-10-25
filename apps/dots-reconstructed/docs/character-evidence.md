# Character subsystem evidence

This standalone subsystem retains the installed application's actual Orbit character JavaScript, WebAssembly, meshes, native presets, artwork and fitting resources. It does not replace the animated characters with generated pictures or CSS animation. The surrounding React host/editor are reconstructed source; the shipped WASM is reused, not recovered C++ source.

## Identity and scope

- Original archive: `/Applications/ChatGPT.app/Contents/Resources/app.asar`.
- Retained prior analysis archive SHA-256: `5ddc4e48259aa6f979e04529b1a5a4ae54b0f5c4ad6db5c6e004924c10916ddb`.
- Bounded extracted prefix: `webview/assets/orbit-character-a46c99f7e8749621/`.
- SDK: `0.12.0`; source revision `958e5233d3340a17fff5b1c06f13cd1d51893c83`.
- Resource revision: `335b9daa1c583b96f112d1e9143338b6b2de374c2779d695efc75f76c157424e`.
- Asset manifest: `tools/character-assets.json`, 465 hash-pinned files. `public/dot-engine/provenance.json` preserves original member names and precise derived-file hashes.

Retained original REA evidence:

| Question | Evidence ID |
|---|---|
| Four character modules, bounded static analysis | `ev_3fb33ac4ddd21662f1f1b2aa7bbc522fae8903e68fde83bc6314bbf33df46830` |
| Character summary projection | `ev_1ce38443451727e4c4ecc14d3514cf30dd73c12c06344422faa71b9099816b69` |
| Host/activity incoming trace | `ev_1c86509402299760a0761ce2c95a7e19c8a9e0d80f3e0799331973fb0a5285fe` |
| Nine surrounding motion modules | `ev_d19d90be8d7b629407155d8c5e740faaea455b7362d8a3ab3d4ded42b829a2aa` |

These IDs describe static analysis; they are not evidence of original-account feature activation or frame-by-frame parity. Prior source locations and findings live in the earlier workspace's `docs/research/dot-character-motion-findings-2026-10-18.json`. The new project includes all runtime resources and does not load that workspace.

## Reproduce the assets

```sh
node tools/extract-character-assets.mjs --asar /Applications/ChatGPT.app/Contents/Resources/app.asar
```

For a retained identical extraction, use `--cache /absolute/path/to/dot-engine`. `--output` selects an alternative destination. The tool reads only the pinned Dots prefix, verifies original hashes before patching, and verifies every output hash. A changed app build fails explicitly instead of silently mixing WASM/resource versions.

Only local engine patches:

1. `frame.mjs`: use included single-thread WASM even when SharedArrayBuffer is available. The single-thread build still uses its original geometry-preparation worker.
2. `frame.mjs`: when initial state bytes are empty, asynchronously select native preset bytes by the host's preset ID or title. Empty state previously required an account-supplied appearance.
3. `frame.css`: inherit the host light/dark color scheme and transparent background.

No WASM/data modifications. No generated `dot-characters/characters.png` is included. No remote accounts, inference providers, cloud execution clients or unrelated ChatGPT application modules are required by this renderer.

## Contracts retained

- Same-origin iframe messages check source/origin/owner. An owner starts with `orbit-character`, `presentation`, Uint8Array state, `active`, `reducedMotion`, `requestReady:true`.
- Native ORBAST1 appearance bytes are persisted as base64; 65,536-byte limit. Invalid base64 fails visibly; native validation checks semantic validity before constructing the character.
- Five native categories: Shape, Color, Eyes, Eyewear, Accessory. Availability, retired entries, accessory colors and actual thumbnails are supplied by the native catalog.
- Eight heroes, as stored in the original data: Felipe (`blue_beret`), Alfred (`alfred`), Jojo (`purple_heart`), Todd (`lime_frog`), Iris (`coral_monocle`), Thelma (`gus`), Josh (`blue_spectacles`), Iggy (`lime_headphones`). Native engine contains 108 total presets; the editor intentionally follows the original eight-hero chooser.
- Activity states: None 0, Working 1, Searching 2, Creating 3, Payment 4, Thinking 5, NeedsInput 6, Ready 7, Paused 8, Error 9. Original controller keeps ordered episodes and Neutral outcomes.
- Avatar gaze: non-touch pointer, 10-second attention window, cancellation on blur/hidden. Editor: primary-pointer capture, 6px click/drag distinction, keyboard Signature reaction. Native code controls gaze easing, geometry, blink, activity props and reactions.
- Preparation/first-frame/snapshot/disposal are original implementations. Host pauses when outside viewport/hidden and forwards system reduced-motion changes.
- Editor desktop body: 480px, controls/preview ratio 3:2. At narrow widths preview is above controls. Native dialog traps focus, Escape dismisses and prior focus is restored.
- The shipped `orbit-thumbnails/index.json` contains 528 component-option entries and 448 PNG layers, not complete hero portraits. `NativeAvatar`/`nativePortrait()` obtain complete neutral portraits through the actual native snapshot command. Missing list portraits are deduplicated and serialized through one shared offscreen editor renderer, cached, and the renderer is released after ten idle seconds. This avoids one WASM/WebGL instance per sidebar row. Default portraits can be generated without opening the visible appearance editor.

## Boundaries

The source reconstruction does not establish the active original account's feature gates, exact surrounding original layout/pixel parity, or server-side agent harness. This is a local Dots renderer/appearance editor, not a cloud-service replacement. Native motion runs from the shipped engine, whose internals have not been decompiled here. Preserve `THIRD_PARTY_NOTICES.txt`; its dependency inventory is not a separate license grant for the proprietary engine or permission for redistribution.
