// Route and settings-service boundaries for the exact shipped Settings UI.
// No setting rows, sidebar markup, modal layout or labels are reproduced here.
// Static source contracts: docs/exact-ui/settings-shell.md.
export const ORIGINAL_SETTINGS_MODULES = Object.freeze({
  page: 'settings-page-20e2bed110da.js',
  general: 'general-settings-ac26e93f0ea2.js',
  appearance: 'appearance-settings-90f8e813006c.js',
  account: 'account-settings-6840b590b4f0.js',
  personalization: 'personalization-settings-c24ed4573607.js',
  plugins: 'plugins-settings-94cd739d6862.js',
});

// Local account and plugin preferences have no ChatGPT authentication method.
// Declare the sections this port can display at the capability boundary; keep
// the original section metadata, sidebar, rows, controls and routed bodies.
export function installLocalSettingsVisibility({ initial, visibilityModule }) {
  initial._ft();
  const slugs = new Set(['general-settings', 'appearance', 'account', 'personalization', 'plugins-settings', 'keyboard-shortcuts', 'usage']);
  const sections = initial.hft.filter(section => slugs.has(section.slug));
  return visibilityModule.ExactAdaptSettingsVisibility(() => function localSettingsVisibility(requested) {
    const active = sections.find(section => section.slug === requested)?.slug ?? 'general-settings';
    return { visibleSettingsSections: sections, activeSettingsSection: active,
      shouldRedirectToVisibleSettingsSection: requested != null && !slugs.has(requested),
      cloudPreferencesAccessError: null, shouldRenderRouteContent: true,
      settingsNavigationSections: sections, showEnterpriseUsageLabel: false };
  });
}

export function createOriginalSettingsRoutes({ initial, React, jsx }) {
  if (typeof initial.ExactSettingsSection !== 'function' || typeof initial.ExactInitSettingsSection !== 'function') {
    throw Error('Expose the original f8/PPl Settings section component and initializer before creating Settings routes.');
  }
  initial._ft();
  initial.PF();
  initial.ExactInitSettingsSection();
  const section = slug => slug === 'usage'
    ? jsx(React.Fragment, { children: [jsx(initial.ExactSettingsSection, { slug }),
      jsx(initial.YEn, { title: '사용량 정보를 사용할 수 없습니다', description: '이 로컬 계정에는 연결된 사용량 정보가 없습니다.' })] })
    : jsx(initial.ExactSettingsSection, { slug });
  const metadata = initial.hft;
  if (!Array.isArray(metadata)) throw Error('Original Settings section metadata is unavailable.');
  const children = [
    { index: true, element: section('general-settings') },
    ...metadata.filter(item => item.slug !== 'profile').map(({ slug }) => ({
      path: slug === 'plugins-settings' ? slug + '/*' : slug,
      element: section(slug),
    })),
    // These are the same section aliases used by the shipped route registry.
    ...[
      ['computer-use/:browserFamily', 'computer-use'],
      ['computer-use/messages', 'computer-use'],
      ['browser-use/extensions', 'browser-use'],
      ['browser-use/downloads', 'browser-use'],
      ['browser-use/history', 'browser-use'],
      ['browser-use/contact-info', 'browser-use'],
      ['browser-use/passwords', 'browser-use'],
      ['browser-use/site-settings/*', 'browser-use'],
      ['connections/:connectionsTab/:connectionsAction', 'connections'],
      ['connections/:connectionsTab', 'connections'],
      ['cloud-environments/*', 'cloud-environments'],
      ['code-review/repositories/:repositoryId', 'code-review'],
      ['teams/:teamId', 'teams'],
      ['teams/:teamId/join', 'teams'],
    ].map(([path, slug]) => ({ path, element: section(slug) })),
  ];
  return [{
    path: '/settings',
    element: jsx(React.Suspense, { fallback: null, children: jsx(initial.NF, {}) }),
    children,
  }];
}

// Original settings descriptors use persisted keys such as appearanceTheme,
// while theme.mjs accepts the descriptor property names such as theme.
export function originalThemeSettings(shared, values = {}, defaults = {}) {
  shared.Sut();
  const settings = { ...defaults, ...values };
  for (const [name, descriptor] of Object.entries(shared.xut)) {
    if (Object.hasOwn(values, descriptor.key)) settings[name] = values[descriptor.key];
  }
  return settings;
}

export async function connectOriginalSettingsTheme({ initial, shared, settingsService,
  initOriginalTheme, initialValues = {}, currentTheme, onTheme, onError = console.error }) {
  if (!settingsService?.readAll || !settingsService?.subscribe) throw Error('A local settings service is required.');
  shared.Sut();
  let theme = currentTheme;
  let disposed = false;
  let scheduled = false;
  let revision = 0;
  const subscriptions = [];
  const apply = async () => {
    const request = ++revision;
    const snapshot = await settingsService.readAll();
    if (disposed || request !== revision) return;
    const settings = originalThemeSettings(shared, snapshot.values ?? {}, initialValues);
    theme?.dispose?.();
    theme = initOriginalTheme(initial, shared, settings);
    onTheme?.(theme);
  };
  const schedule = () => {
    if (disposed || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!disposed) apply().catch(onError);
    });
  };
  try {
    const keys = new Set(Object.values(shared.xut).map(descriptor => descriptor.key));
    keys.add('coloredUserMessages');
    for (const key of keys) {
      const subscription = await settingsService.subscribe(key, schedule);
      if (disposed) subscription?.[Symbol.dispose]?.();
      else subscriptions.push(subscription);
    }
    await apply();
  } catch (error) {
    for (const subscription of subscriptions) subscription?.[Symbol.dispose]?.();
    throw error;
  }
  return {
    get theme() { return theme; },
    refresh: apply,
    dispose() {
      if (disposed) return;
      disposed = true;
      ++revision;
      for (const subscription of subscriptions) subscription?.[Symbol.dispose]?.();
      theme?.dispose?.();
    },
  };
}
