/**
 * Read-only LOCAL inventory boundary for the unchanged shipped Plugins page.
 * This module neither reads the installed app's state nor connects to its APIs.
 */
const PAGE_URL = '/original/webview/assets/skills-page-b946c71dd768.js';
export const ORIGINAL_PLUGIN_ROUTES = Object.freeze({
  catalog: '/plugins',
  skills: '/skills',
  detail: '/plugins/:pluginId',
  legacyManage: '/skills/manage',
  manage: '/settings/plugins-settings',
});

let pagePromise;
export function loadOriginalPluginsPage() {
  // Invoke in the browser. The shipped wrapper runs its own original initializer.
  return pagePromise ??= import(PAGE_URL).then(module => module.SkillsPage);
}

/** Render beneath the existing original scope, Intl, query and router providers. */
export function createOriginalPluginRouteElements({ React, Route, SkillsPage }) {
  if (!React?.createElement || !Route || !SkillsPage) throw new TypeError('Original Plugins routes require React, Route and SkillsPage');
  return [ORIGINAL_PLUGIN_ROUTES.catalog, ORIGINAL_PLUGIN_ROUTES.skills].map(path =>
    React.createElement(Route, { key: path, path, element: React.createElement(SkillsPage) })
  );
}

function features() {
  return [
    { name: 'plugins', enabled: true }, // The local inventory can be browsed.
    { name: 'remote_plugin', enabled: false },
    { name: 'computer_use', enabled: false },
    { name: 'browser_use_external', enabled: false },
    { name: 'browser_use', enabled: false },
  ];
}

/**
 * undefined means unhandled, so the host can retain its normal explicit error.
 * Empty inventories describe this adapter, never the installed native app.
 */
export function localPluginConfig({ model = null, providerName = 'OpenCode (local)' } = {}) {
  return {
    model: typeof model === 'string' && model.trim() ? model : null,
    model_provider: 'opencode-local',
    model_providers: { 'opencode-local': { name: providerName } },
    mcp_servers: {},
    plugins: {},
    skills: { config: [] },
    apps: { _default: { enabled: false } },
    profiles: {},
  };
}

export function readOnlyLocalPluginRpc(name, options = {}) {
  switch (name) {
    case 'plugin/list':
      return { marketplaces: [], featuredPluginIds: [], marketplaceLoadErrors: [] };
    case 'plugin/installed':
      return { marketplaces: [] };
    case 'experimentalFeature/list':
      return { data: features(), nextCursor: null };
    case 'configRequirements/read':
      return { requirements: { allowBrowserAndComputerUse: false } };
    case 'config/read':
      // This is this adapter's configuration, never the native app's config.
      // No layer means the original UI receives no native file write target.
      return { config: localPluginConfig(options), origins: {}, layers: [] };
    case 'skills/list':
      return { data: [] };
    case 'mcpServerStatus/list':
      return localPluginMcpServers();
    default:
      return undefined;
  }
}

/** Direct manager method contract: localManager.listMcpServers(params, options). */
export function localPluginMcpServers() {
  return { data: [], nextCursor: null };
}

/**
 * The original Public catalog waits for both workspace-root and execution-path
 * queries to have fetched, even when the execution-path native service is absent.
 * No native plugin runtime or native Codex home exists in this local adapter.
 * Seed the original query families, rather than replacing loading/empty UI.
 * Call after loadOriginalPluginsPage() and before rendering its children.
 */
export function installLocalPluginQueries({ initial, scope, model = null, providerName } = {}) {
  if (!scope?.query?.setData) throw new TypeError('An original scope query store is required');
  initial.yBr?.(); // original experimental-feature query initializer Dh
  initial.Jfr?.(); // original local catalog initializer GT (includes _C)
  initial.Afr?.(); // original remote-plugin selector initializer wUn
  initial.C4?.(); // original Public catalog query initializer lTc
  initial.Jbr?.(); // original config/MCP query initializer CC
  initial.VRt?.(); // original user-saved-config initializer vX
  initial.NNn?.(); // original installed-skills initializer jI
  const host = 'local';
  const configResponse = readOnlyLocalPluginRpc('config/read', { model, providerName });
  for (const [descriptor, key, value] of [
    [initial.vBr, host, features()],
    [initial.hxr, { hostId: host }, { roots: [], labels: {} }],
    [initial.lxr, { hostId: host }, { codexHome: null }],
    [initial.dxr, { hostId: host }, { homeDirectory: null }],
    [initial.BRt, { hostId: host }, configResponse.config],
    [initial.ixr, host, { response: configResponse, readSucceeded: true }],
    [initial.jBr, { cwd: null, hostId: host }, configResponse],
    [initial.Zbr, host, localPluginMcpServers()],
    [initial.Ybr, host, localPluginMcpServers()],
  ]) {
    if (!descriptor) throw new Error('An original Plugins query export is unavailable');
    scope.query.setData(descriptor, key, value);
  }
  if (scope.queryClient?.setQueryData && Array.isArray(initial.MNn)) {
    scope.queryClient.setQueryData([...initial.MNn, host, []], { data: [] });
  }
  if (scope.queryClient?.setQueryData) {
    // Iwn (the settings MCP list) uses its own direct TanStack query rather
    // than BRt or ixr. zwn uses the effective config family seeded above.
    // Data settles both even when there is no selected plugin workspace.
    scope.queryClient.setQueryData(['config', 'mcp', 'servers', host, null], configResponse);
    scope.queryClient.setQueryData(['config', 'layered-response', host, null], configResponse);
  }
  return { hostId: host, readOnly: true, inventorySource: 'local-adapter' };
}
