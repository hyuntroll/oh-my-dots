# Exact renderer asset feasibility

Settings/profile/Plugins follow-up: the current manifest contains 1,479 immutable files (82,727,116 bytes), 33 explicit UI roots and zero missing dependencies. New roots cover the original profile dropdown, Settings page and visible section modules, Plugins directory, keyboard shortcuts and usage page. All current manifest hashes pass `npm run original:verify`. The smaller counts below describe the earlier Dots room/character extraction stage.

This pass inspected the installed `/Applications/ChatGPT.app/Contents/Resources/app.asar`, SHA-256 `5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869`. It differs from the October 18 baseline (`5ddc4e…`). The client bundle, CSS and named character runtime are available as original bytes. The bundle has source-map comments, but the archive inventory contains no `.map` files.

## Preserved assets

`../../public/original/exact-assets.json` is the canonical extraction manifest. Every listed file has its exact original relative path, byte count and SHA-256. The extraction covers 1,135 files / 77,219,548 bytes: 423 JavaScript files, 31 CSS files, 63 font files, 556 character runtime files and the remaining HTML/images/resources. All 1,135 written hashes were verified after extraction. The `open-file-ea7bd5664e81.js` initializer wrapper is an explicit root for original message-file output cards; its implementation and resource closure were already included. The explicit `text-document-preview-b7c6cb8e32f5.js` root includes the original text preview and its static/literal dynamic/Vite/CSS/image closure for the actual file tab.

Original global styles:

- `webview/assets/app-shared-295ec67e1c5d.css` (1,321,704 bytes)
- `webview/assets/app-initial-9d42883ac737.css` (281,154 bytes)
- `webview/assets/app-primary-4d86db640757.css` (42,118 bytes)

Fonts include `OpenAISans-Regular-c56711d328c4.woff2`, `OpenAISans-Medium-7b9c963f9063.woff2`, `OpenAISans-Semibold-e259229c5327.woff2`, and `OpenAISerif-Light-5ecdb837da98.woff2`. These being shipped does **not** establish which font a particular screen uses. Original semantic font tokens and root attributes select the actual branch. The default shared theme uses a system font and a 14px base; `[data-codex-window-type=browser]` overrides the base to 1rem. The Electron runtime attributes must be measured and mirrored, rather than selecting a browser branch because the replica runs on localhost.

The original main HTML establishes `@layer theme, base, components, utilities;` before dependency CSS. Preserve that order. It loads `index-40a03cbe11dc.js`, preloads the rolldown/runtime/shared chunks, and links the shared stylesheet. This extraction preserves HTML as evidence; a separate local host may select components and supply local bridges without changing these immutable assets.

The complete current `webview/assets/orbit-character-a46c99f7e8749621/` prefix is included, with 556 original files. The renderer's `qac()` computes `./assets/orbit-character-a46c99f7e8749621/fd5f2a1997e55d5f/frame.html` relative to the document. A host should use a base URL of `/original/webview/` or explicitly preserve that document-relative lookup.

## Dependency boundaries

`tools/extract-original-ui.mjs` parses static imports with Babel, follows them recursively, and preserves all original bytes. It follows literal dynamic imports and Vite preload candidates only from selected Dots roots and the character editor/native room/tab chunks. Global app-shared/app-initial/app-primary/main optional dynamic graphs are not expanded. This avoids extracting the entire application. It does not fetch remote resources or execute target code. The script fails before writing if its 2,500-file/200MiB bound is exceeded.

The initial seven UI root families have 161 statically imported modules totaling 25,683,043 bytes. The served closure also includes the explicit RPC and application entry wrappers needed by the independent host. The expanded served closure includes the welcome page (`page-a0db2051c101.js`), optional UI branches and native assets. An asset being in a Vite preload table does not prove a runtime load. The exact manifest records edge kinds separately.

## Why the previous UI looked similar rather than identical

The previous `client/app.css` is handwritten and uses local class names, fixed values and warm neutral colors (`#faf9f6`, `#252525`, etc.). Original Dots components instead use the application's shared utility classes and original component classes, semantic surface/color/font tokens, original menu/dialog behaviors and runtime animation primitives. Substituting a new stylesheet for those is a redesign, even where a few panel measurements match.

For the exact UI objective, execute the original component exports and original styles, then adapt the state/network/native bridge at a separate host boundary. If an otherwise private export is needed, retain its original file and produce a clearly labeled derived exposure module; do not label the derivative as exact original bytes. Original cloud-side planner/memory/tool-policy behavior remains unknown from these client assets.

## Literal image closure correction

Vite emits some local resources as `new URL('image-hash.png', import.meta.url)` without a leading `./`. The initial resource scan omitted these bare relative paths. Runtime inspection identified `o-soft-gradient-gray-ed947018774a.png` with zero natural width; static source references it from the side panel, its dedicated image wrapper and the original computer view. This image is now an explicit root (686,529 bytes, SHA-256 `ae104833d3d8b61a9ff75ce90c4df0709c55522dcf7e73e1af0f4d9998b1e34f`).

The extractor now also follows literal bare relative image/resource paths from the selected JavaScript closure when the exact path exists in this ASAR. It excludes remote/data URLs and interpolated templates and retains the existing file/byte bounds. This added 61 original assets, including the original computer preview, browser icons and theme images. It does not search or extract all archive images. Actual use of each candidate remains a runtime question.

## CSS module closure correction

JavaScript static imports alone did not establish complete styles: the welcome page's generated `_spinCanvas_iz62r_5` class is defined in `page-af6278188bd3.css`, linked by a parent preload graph rather than that page's own imports. The initial host consequently missed its absolute positioning and canvas containment. The extractor now explicitly includes that page CSS and compares exact generated class identities from selected non-global UI JavaScript against every original renderer CSS file. This also discovered missing header, thread chrome and side-panel-new-tab CSS. `public/original/exact-styles.json` lists 30 original document styles in shared/initial/primary/page/component order; it excludes the isolated character frame's CSS. The computer panel/session/view and file preview roots are also included. No stylesheet was rewritten. Matching class identities establishes a static asset dependency; complete state-by-state visual verification remains a runtime task.
