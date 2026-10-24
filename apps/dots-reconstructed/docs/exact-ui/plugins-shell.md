# Original Plugins page and local read-only boundary

The Plugins UI is the shipped component, not a reconstruction. This investigation used only static bytes in `public/original/webview/assets` and `/Applications/ChatGPT.app/Contents/Resources/app.asar`. It did not access native app UI, Inspector, credentials, account stores, plugin installation, OAuth, or remote account APIs.

## Entry and routes

| Purpose | Original source / symbol | Contract |
| --- | --- | --- |
| Browse root | `skills-page-b946c71dd768.js` → `SkillsPage` | No props. Wrapper imports shared code and runs `skills-page-11739270b09b.js` initializer `Jt` before exporting component `It`. |
| Browse implementation | `skills-page-11739270b09b.js`: `It → Lt → Rt → At` | `At({navigation})` renders original `plugins-skills-tabs.Cs`, exported as `i`. |
| Plugins browse | `/plugins` | Original global route index renders lazy `HFs` (`SkillsPage`). |
| Skills browse | `/skills` | Same root, selected browse tab follows pathname when original customization layout is enabled. |
| Plugin detail | `/plugins/:pluginId` | `plugin-detail-page-ce4fffd184a9.js`, export `PluginDetailPage`. No local items exist to open yet. |
| Legacy manage | `/skills/manage` | `manage-plugins-page-e4ad7f2f0c17.js`, export `ManagePluginsPage`; redirects eligible host to `/settings/plugins-settings`. |
| Current manage | `/settings/plugins-settings` | Original manage button in `plugins-skills-tabs.Ki` navigates here, preserving `initialHostId`, `initialTab:'plugins'`, and `returnToPreviousHistoryEntry:true`. Settings worker owns this screen. |
| Old detail redirect | `/skills/plugins/:pluginId` | Original `zFl` redirects to `/plugins/:pluginId`, preserving search/hash/state. |

`/plugins/manage` is **not** the manage route; it would match the plugin detail route.

Use the existing original scope, QueryClient, Intl and router providers. The original global route wraps Plugins in `JFl`, which reads access selector `initial.kIr` (`l_`) and renders children only when status is `allowed`. No duplicate provider or custom page markup is needed.

`exact-host/local-plugins.mjs` exports:

```js
const SkillsPage = await loadOriginalPluginsPage(); // browser only
installLocalPluginQueries({ initial, scope }); // before page children render
const routes = createOriginalPluginRouteElements({ React, Route, SkillsPage });
```

The helper returns the two original browse routes only; it does not replace the parent app shell or settings routes. It performs no mutation or network call.

## Original navigation and page behavior

Global sidebar `app-initial.ZTc` adds the Plugins item when desktop navigation is enabled and `IT({enabled:true,hostId:'local'})` is true. `IT` (`initial.Lpr`) reads original experimental-feature query `Eh` (`initial.vBr`), finds `{name:'plugins',enabled}`, and defaults to true when that record is absent. It changes the sidebar label between Plugins and Skills; it does not establish a cloud connection.

Sidebar navigation helper `zTc` opens `/plugins` with state `{initialHostId,pluginDirectoryEntrypoint,...}`. Original customization sidebar `HCl` also uses `/plugins` and `/skills`; its installed section is lazy `installed-plugins-b18b623e8d92.js`, export `InstalledPlugins`, props `{hostId,searchQuery}`.

Original `plugins-skills-tabs.Cs` owns title, intro, search, directory tabs and content layout. It selects a host from `Yz`/`Jz` history-state families and original available-host helpers. The local host is literal `local`. Its directory choices come from `vs({hostId})`: Public (`openai`) and Personal always exist; Workspace and Teams depend on real account/inventory data. A local adapter must not invent a workspace or team.

Search is original URL state: `?search=...`. Directory choice is `?directory=personal` (or `openai`); category is `?category=...`. Original router location/history must therefore remain available. `SkillsPage` should be mounted directly rather than extracting its inner body, so its header, tabs, state and original initializers stay intact.

Empty Public catalog produces original heading/search/directory controls with no category cards: `Ja` maps categories and `fTc` removes empty categories. Personal uses the shipped `No plugins found` empty state. Do not add a substitute empty-state component to Public.

## Read-only local data

`local-plugins.mjs.readOnlyLocalPluginRpc(name)` returns `undefined` for unhandled requests, allowing the parent manager to keep its explicit unsupported-operation error. The host can call it at the beginning of `localManager.sendRequest`:

```js
const result = readOnlyLocalPluginRpc(name);
if (result !== undefined) return result;
```

| Native request | Local response | Static consumer evidence |
| --- | --- | --- |
| `plugin/list` | `{marketplaces:[],featuredPluginIds:[],marketplaceLoadErrors:[]}` | `app-initial.GT`: original `aUn`/`oUn`; `lTc`: `cTc` destructures these fields then builds local plugin/category data. |
| `plugin/installed` | `{marketplaces:[]}` | `app-initial.LUn` returns inventory; `YT` (`initial.Efr`) uses its marketplaces and converts installed entries through `UHn`/`RHn`. |
| `experimentalFeature/list` | `{data:[{name:'plugins',enabled:true},{name:'remote_plugin',enabled:false},…],nextCursor:null}` | `qwt` paginates `data`/`nextCursor`; `IT` reads plugins; `qT` (`initial.jfr`) reads remote_plugin. Browser/computer plugin features are explicitly false because this adapter has no native plugin tool execution service. |
| `configRequirements/read` | `{requirements:{allowBrowserAndComputerUse:false}}` | `Hwn` forwards this response; `Gzn` checks requirements to settle browser/computer plugin availability. This declares a local limitation, not remote readiness. |

These are the inventories and capabilities of the **local adapter**. They do not describe or inspect the installed native application's plugins. No plugin install/uninstall/share/create/reconcile/OAuth operation is implemented. Such actions must remain explicit unsupported operations until a real local implementation exists.

### Native services and original query families

Original Public-home hook `uTc` (`initial.S4`) waits for features, workspace roots, execution paths, local catalog, installed inventory, auth and availability inputs. Two otherwise disabled native queries can leave it waiting indefinitely, so `installLocalPluginQueries` seeds only these truthful local inputs through the original query store:

| Original descriptor | Key | Data / reason |
| --- | --- | --- |
| `initial.vBr` (`Eh`; initializer `initial.yBr` / `Dh`) | `'local'` | Same local feature records as native read-only RPC. The remote catalog is disabled. |
| `initial.hxr` (`pC`) | `{hostId:'local'}` | `{roots:[],labels:{}}`; no plugin project roots are connected. Native `hwn` itself returns this shape if `appServices.workspaceRoots` is absent. |
| `initial.lxr` (`cC`) | `{hostId:'local'}` | `{codexHome:null}`; no native Codex execution-home directory exists in this adapter. `BHn` accepts null and does not append an inferred native marketplace path. |

`cC` is normally enabled only when `appServices.executionPaths` exists, but `cTc` requires both `pC.isFetched` and `cC.isFetched`. Seeding the original data family resolves that contract without fabricating a path or patching rendered loading UI. The original services, if implemented later, are `workspaceRoots.read(requestId,params)` / `.cancel(requestId)`, and `executionPaths.readHomePaths(hostId)` / `.readHomeDirectory(hostId)`.

The original catalog keeps native local inventory separate from hosted inventory. `JT(hostId)` selects hosted behavior only for original durable host category; browse the plugin catalog with `hostId:'local'`. Keep `authMethod:'local'` and `hasChatGptToken:false`. Original personal/workspace catalog queries explicitly return empty responses when `initial.ant` resolves a non-ChatGPT auth method; do not fake ChatGPT identity to unlock them. Remote-home query `mTc` also avoids HTTP for non-ChatGPT auth, but disabling remote_plugin prevents unnecessary auth/native lookup entirely.

`create-permissions-60eb32477e99.js` computes archive/MCP authoring from matching real account data, flags and permissions. No authoring permission should be synthesized for local UI browsing.

## Verification and limits

`node --check exact-host/local-plugins.mjs` passed. The five main original plugin modules were compared byte-for-byte against ASAR on 2026-10-25 and are identical:

| Module | SHA-256 |
| --- | --- |
| `skills-page-b946c71dd768.js` | `915353c5454e823a4861f8d1c16955017119dddd353feb34fec3243181512b9f` |
| `skills-page-11739270b09b.js` | `48a209ecf5ca641e1adb5946ec7a640bfc65d706a180e3416c7a10c72df37f92` |
| `plugins-route-eligibility-7948359cf80b.js` | `4f68b260b9ab38f806177235f802eb8bde18264aae7a64ab89ec72c7b4627e3f` |
| `plugins-skills-tabs-e4b5b4f0f8a7.js` | `f118d7a06db2c72e7ecc3a82c9de46aec33bba908e99d21765f2434fbfb3c27f` |
| `plugins-cards-grid-157bb89dc302.js` | `2209997e178d1d8fb3a22d0b5975d73a7c11e1b4bb978f67afaccf7503391543` |

The source contracts above are statically verified; browser integration/visual verification belongs to the parent task. No claim of successful installation, remote access, connected plugin, or recovered native harness follows from rendering the page.

## Settings-tab loading follow-up

The read-only boundary also settles the original plugin settings dependencies:

- `config/read` returns `{config,origins:{},layers:[]}`. `config` describes the local adapter only: actual app model if supplied, provider `opencode-local` named `OpenCode (local)`, empty `mcp_servers`/`plugins`, empty skill config and disabled default apps. No native user config file or writable config layer is claimed. `localPluginConfig({model,providerName})` exports that object. The parent should pass its current persisted app model when available.
- `skills/list` returns `{data:[]}`. Original `qdi` iterates `response.data`, then each entry's `skills`; zero entries is a valid empty inventory.
- Original manager **method** `listMcpServers(params,options)` must delegate to `localPluginMcpServers()`, returning `{data:[],nextCursor:null}`. Original `gyn` calls this method, not `sendRequest`. `mcpServerStatus/list` also has the same read-only response for callers that use RPC directly.
- `initial.BRt` is `_X`, the user-saved config descriptor keyed `{hostId:'local'}`; its cached data is the config object itself. `initial.ixr` is `bC`, keyed `'local'`, whose raw cached data is `{response:{config,origins,layers},readSucceeded:true}` before its original selector. Empty layers cause `eTn` to return no native write target.
- Original full MCP query `initial.Ybr` (`fTn`) and tools/auth query `initial.Zbr` (`SC`) are keyed by host ID and accept the empty paginated inventory. The installed skills hook `Ydi` uses query key `[...initial.MNn,'local',[]]`, where original `MNn` is `['skills']`.
- Personal directory's `za` reads **another** descriptor, `initial.dxr` (`Twn`, home directory), not `initial.lxr` (`cC`, Codex home). The helper seeds `{homeDirectory:null}` at `{hostId:'local'}`. Without this input, an explicit fetch in the original Personal flow throws `Home directory is unavailable`; inventing or reading a native home directory is unnecessary.

`installLocalPluginQueries({initial,scope,model,providerName})` seeds the original descriptors above after their original initializers. Parent still needs the RPC and direct MCP method handlers for real refetch/refresh paths. No successful config write or plugin mutation is returned.

### Display-only preview catalog assessment

Static source supports original cards from local `plugin/list` metadata and details from `plugin/read` response `{plugin:{summary,skills,apps,mcpServers,...}}`. However, a bare `canInstall:false` metadata field is not consumed by the inspected original action component. `plugin-detail-actions.Jt` blocks installation through `blockedReason`, `isInstallBlockedLoading` or `isInstallLocked`; an available, uninstalled item normally offers Install. Reusing admin-disabled or missing-required-app reasons solely to block preview interaction would misrepresent policy or capability. No preview catalog has been implemented pending a verified original read-only policy boundary.

A further exact dependency was found in the original settings MCP list `ha`: its `Cr = initial.txr` (`Iwn`) uses direct TanStack query `['config','mcp','servers','local',null]`, selecting `Lwn(response)` into `{servers,configWriteTarget,serverOrigins}`. It does not read `BRt` or `ixr`. The original effective config hook `initial.exr` (`zwn`) reads `initial.jBr` (`xh`) with `{cwd:null,hostId:'local'}`. Both can remain `isPending` while a workspace-selection query disables the fetch. The helper now seeds the original `jBr` family with the local config response and the direct MCP/layered-response caches with the same raw `{config,origins,layers}` response. No selected project or native persisted state is invented.

## Parent browser verification

On isolated UI 3426 the original Plugins directory now renders inside its original `FR → IR` app shell, including Plugins/Skills header tabs, search, Public/Personal tabs, refresh and Manage navigation. Personal displays the normal `플러그인이 없습니다` state. Manage opens the original settings shell and settles into `연결된 MCP 서버가 없습니다` instead of remaining on a spinner. Public is an empty local catalog, not a fabricated marketplace. Screenshots: `docs/qa/exact-ui/plugins-directory.png` and `plugins-management.png`. Actual plugin installation, OAuth and native configuration writes remain unsupported.
