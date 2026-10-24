// This host renders the shipped components. It does not reproduce their DOM,
// styles, motion, or event handlers. Version-specific aliases are recorded in
// docs/exact-ui/original-renderer.md and must change with the source artifact.
const config = globalThis.__DOTS_EXACT_CONFIG__ ?? {};
const assetBase = config.assetBase ?? '/original/webview/assets/';
const url = new URL(location.href);
const view = config.view ?? url.searchParams.get('view') ?? 'auto';
const diagnostics = { phase: 'loading', view, errors: [], characterStatuses: [], source: '5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869' };
globalThis.__DOTS_EXACT__ = diagnostics;
function report(error, info) {
  const entry = { message: String(error?.message ?? error), stack: String(error?.stack ?? ''), componentStack: info?.componentStack ?? '' };
  diagnostics.errors.push(entry);
  diagnostics.phase = 'error';
  console.error('[dots-exact-host]', JSON.stringify(entry));
}
addEventListener('error', event => report(event.error ?? event.message));
addEventListener('unhandledrejection', event => report(event.reason));
// Observe the existing native frame protocol without sending synthetic state,
// replacing messages, or changing the original widget's lifecycle.
addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.type !== 'orbit-character') return;
  const { status, reason, phase, ownerId } = event.data;
  if (!['loaded', 'ready', 'failed', 'startup-stage'].includes(status)) return;
  diagnostics.characterStatuses.push({ status, reason, phase, ownerId, at: performance.now() });
  if (diagnostics.characterStatuses.length > 80) diagnostics.characterStatuses.shift();
  if (status === 'failed') console.warn('[dots-exact-character]', JSON.stringify({ status, reason, phase, ownerId }));
});

// Loading the original CSS also preserves its original relative font URLs.
async function loadOriginalStyles() {
  const response = await fetch('/original/exact-styles.json');
  if (!response.ok) throw Error('The extracted original stylesheet manifest could not be loaded');
  const paths = await response.json();
  if (!Array.isArray(paths) || !paths.every(path => /^webview\/assets\/[a-zA-Z0-9._-]+\.css$/.test(path))) throw Error('Invalid original stylesheet manifest');
  await Promise.all(paths.map(path => new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/original/' + path;
    link.onload = resolve;
    link.onerror = () => reject(Error('Original stylesheet could not be loaded: ' + path));
    document.head.append(link);
  })));
  diagnostics.styleRoots = paths;
}
document.documentElement.dataset.codexOs = 'darwin';
document.documentElement.dataset.codexWindowType = 'electron';
document.documentElement.dataset.windowType = 'electron';

try {
  await loadOriginalStyles();
  const shared = await import(assetBase + 'app-shared-fc3316d48427.js');
  for (const name of ['$st', 'ZSt', 'oCt', 'cCt', 'WCt', 'ekt', 'Lst', 'NSt']) shared[name]();
  const React = shared.FBt();
  const jsx = shared.LNt().jsx;
  const ReactDOM = shared.PNt();
  const queryClient = new shared.UCt({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  // The caller may provide a LOCAL service adapter. No real application bridge,
  // account store, tokens, or native process is consulted by this host.
  const rpc = await import(assetBase + 'rpc-94f5a75e4b1f.js');
  if (config.appHost) rpc.setAppHost(config.appHost);
  if (config.appServices) rpc.setAppServices(config.appServices);
  const initial = await import(assetBase + 'app-initial-dddef47d6ef6.js');
  const computerDriver = await import(assetBase + 'webauthn-c37be3fbf886.js');
  const { installLocalComputerTransport } = await import('./local-computer.mjs');
  diagnostics.computer = { errors: [] };
  installLocalComputerTransport({ driverModule: computerDriver, diagnostics: diagnostics.computer, onError: error => console.warn('[dots-local-computer]', String(error?.message ?? error)) });
  if (typeof initial.ExactInitPersistedAtoms !== 'function') throw Error('The asset server must expose the original persisted atom store initializer.');
  const persistedKey = 'dots-exact-persisted-v1';
  let persisted = {};
  try { const saved = JSON.parse(localStorage.getItem(persistedKey) ?? '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) persisted = saved; } catch {}
  initial.ExactInitPersistedAtoms(persisted, (key, value) => {
    if (value === undefined) delete persisted[key]; else persisted[key] = value;
    localStorage.setItem(persistedKey, JSON.stringify(persisted));
  });
  const locale = config.locale ?? 'ko-KR';
  const messages = config.messages ?? (locale === 'ko-KR' ? (await import(assetBase + 'ko-KR-8a007bddadf3.js')).default : {});
  const { initOriginalTheme } = await import('./theme.mjs');
  const settings = config.settings ?? await fetch('/api/settings').then(response => {
    if (!response.ok) throw Error('Local settings could not be loaded');
    return response.json();
  });
  diagnostics.theme = initOriginalTheme(initial, shared, settings);
  const adapterModule = await import('./local-adapter.mjs');
  initial.tyr();
  initial.rmr();
  initial.Fw();
  initial.LR();
  initial.Gy();
  initial.ExactInitNavigationBridge();
  initial.ExactInitLocationBridge();
  initial.lkr();
  initial.zOr();
  const route = config.route ?? { routeKind: 'other', pathname: '/dots/home', routeTemplate: '/dots/home', search: '', clientThreadId: 'route:exact-host', routeConversationId: null, projectContext: null };
  const thread = config.thread ?? { clientThreadId: 'route:exact-host', routeConversationId: null, orbitId: null };
  class Boundary extends React.Component {
    state = { error: null };
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch(error, info) { report(error, info); }
    render() {
      if (this.state.error) return jsx('pre', { role: 'alert', style: { whiteSpace: 'pre-wrap', padding: 24 }, children: 'Original renderer host: ' + String(this.state.error?.message ?? this.state.error) });
      return this.props.children;
    }
  }
  function CaptureScope({ children }) {
    const scope = shared.$St(shared.Qst);
    const intl = shared.okt();
    const [ready, setReady] = React.useState(false);
    React.useLayoutEffect(() => {
      let cancelled = false;
      let adapter;
      diagnostics.scope = scope;
      diagnostics.queryClient = queryClient;
      diagnostics.phase = 'adapting';
      scope.set(initial.CIr, intl);
      Promise.resolve(adapterModule.installLocalAdapter({ initial, scope, queryClient, shared })).then(async value => {
        adapter = value;
        if (cancelled) { value.dispose(); return; }
        diagnostics.adapter = value;
        if (value.settingsService) rpc.setAppServices({ ...rpc.appServices, settings: value.settingsService });
        await config.onScope?.(scope, initial, shared, value);
        if (!cancelled) { setReady(true); diagnostics.phase = 'mounted'; }
      }).catch(report);
      return () => { cancelled = true; adapter?.dispose(); };
    }, [scope]);
    return ready ? jsx(React.Fragment, { children: [jsx(initial.ExactLocationBridge, {}, 'local-location'), jsx(initial.ExactNavigationBridge, {}, 'local-navigation'), React.cloneElement(children, { key: 'local-product' })] }) : null;
  }
  const page = ['auto', 'wizard', 'welcome', 'creating'].includes(view) ? await import(assetBase + 'page-a0db2051c101.js') : null;
  const roomModule = ['auto', 'wizard', 'room'].includes(view) ? await import(assetBase + 'room-view-fe0c1087e5e0.js') : null;
  function OriginalRoom({ profile }) {
    const location = shared.VSt();
    const Room = roomModule.ExactRoom;
    if (!Room) throw Error('The asset server must expose the original inner room component as ExactRoom.');
    const conversationId = profile.active_root_thread_id;
    const localThread = { clientThreadId: shared.uSt(conversationId), routeConversationId: conversationId, orbitId: profile.id };
    const localRoute = { routeKind: 'local-thread', conversationId, hostId: 'durable', orbitId: profile.id, pathname: location.pathname, routeTemplate: location.pathname.startsWith('/local/') ? '/local/:conversationId' : '/dots/:id', search: location.search, clientThreadId: localThread.clientThreadId, routeConversationId: conversationId, projectContext: null };
    // The original conversation view parks its computer panel beside the room;
    // the tab itself is an attachment target for this original portal.
    const room = jsx(React.Fragment, { children: [jsx(Room, { conversationId, dotId: profile.id, active: true, showHeader: true }, 'room'), jsx(initial.Uy, { conversationId }, 'computer-portal')] });
    const shell = jsx(initial.FR, { children: jsx(initial.IR, { children: room }) });
    return jsx(shared.aCt, { scope: initial.QOr, value: localThread, children: jsx(shared.aCt, { scope: initial.MOr, value: localRoute, children: shell }) });
  }
  function OriginalEntry() {
    const location = shared.VSt();
    const profiles = diagnostics.adapter.profiles;
    const dotId = location.pathname.match(/^\/dots\/([^/]+)$/)?.[1];
    const threadId = location.pathname.match(/^\/(?:local|dots\/thread)\/([^/]+)$/)?.[1];
    if (dotId === 'new' || dotId === 'start') return jsx(OriginalWizard, {});
    const selected = config.profileId ? profiles.find(profile => profile.id === config.profileId) : profiles.find(profile => profile.id === dotId || profile.active_root_thread_id === threadId) ?? profiles[0];
    diagnostics.selectedProfileId = selected?.id ?? null;
    return selected ? jsx(OriginalRoom, { profile: selected }) : jsx(OriginalWizard, {});
  }
  function OriginalWizard() {
    const adapter = diagnostics.adapter;
    const accountKey = JSON.stringify([adapter.accountId, adapter.userId]);
    const flow = shared.nCt(initial.Prr, accountKey);
    diagnostics.creationFlow = flow;
    const [completedProfile, setCompletedProfile] = React.useState(null);
    if (completedProfile) {
      return jsx(OriginalRoom, { profile: completedProfile });
    }
    const accepted = flow.step === 'accepted' || flow.step === 'complete';
    const finish = async () => {
      await adapter.refresh();
      const profile = adapter.profiles.find(item => item.id === flow.acceptedOrbitId);
      if (!profile) throw Error('The created local Dot could not be loaded');
      diagnostics.createdProfile = profile;
      setCompletedProfile(profile);
      config.onCreated?.(profile);
    };
    const computerSetup = accepted && flow.acceptedThreadId ? jsx(page.ExactComputerSetup, { conversationId: flow.acceptedThreadId, disabled: false, onContinue: finish }) : null;
    return jsx(page.ExactCreationController, { accountId: adapter.accountId, userId: adapter.userId, available: true, computerSetup, onCreationRejected: () => { diagnostics.creationRejected = true; } });
  }
  let component;
  if (view === 'introduction') {
    const { AeonOnboarding } = await import(assetBase + 'aeon-onboarding-ad5bab6d4da0.js');
    component = jsx(AeonOnboarding, { avatar: 'sunglasses', identity: 'orbit-draft', name: config.name ?? 'dot', startedAtMs: config.startedAtMs, isThinking: false });
  } else if (view === 'appearance') {
    const picker = await import(assetBase + 'aeon-appearance-picker-ca7647885a88.js');
    picker.n();
    function OriginalAppearance() {
      const profile = config.profileId ? diagnostics.adapter.profiles.find(item => item.id === config.profileId) : diagnostics.adapter.profiles[0];
      if (!profile) throw Error('Create a local Dot before opening its original character studio.');
      const conversationId = profile.active_root_thread_id;
      const localThread = { clientThreadId: 'route:dot:' + profile.id, routeConversationId: conversationId, orbitId: profile.id };
      const localRoute = { routeKind: 'local-thread', conversationId, hostId: 'durable', orbitId: profile.id, pathname: '/dots/' + profile.id, routeTemplate: '/dots/:id', search: '', clientThreadId: localThread.clientThreadId, routeConversationId: conversationId, projectContext: null };
      const editor = jsx(picker.t, { conversationId, variant: 'profile', onClose: () => { diagnostics.closed = true; } });
      return jsx(shared.aCt, { scope: initial.QOr, value: localThread, children: jsx(shared.aCt, { scope: initial.MOr, value: localRoute, children: editor }) });
    }
    component = jsx(OriginalAppearance, {});
  } else if (view === 'auto') {
    component = jsx(OriginalEntry, {});
  } else if (view === 'wizard') {
    if (!page.ExactCreationController || !page.ExactComputerSetup) throw Error('The asset server must expose the original creation controller and computer step.');
    component = jsx(OriginalWizard, {});
  } else if (view === 'welcome' || view === 'creating') {
    if (!page.ExactWelcome || !page.ExactSteps || !page.ExactCreating || !page.ExactCharacterScope) throw Error('The asset server must expose the four original page component symbols described in original-renderer.md.');
    const step = view === 'creating' ? 'creating' : 'welcome';
    component = jsx(page.ExactCharacterScope, { accountKey: 'exact-host-local', children: jsx(page.ExactSteps, { step, children: (entered, ref) => view === 'creating' ? jsx(page.ExactCreating, { entered, ref }) : jsx(page.ExactWelcome, { accountId: null, userId: null, flowId: undefined, learnMoreUrl: '', isContinuing: false, onContinue: () => { diagnostics.continueClicked = true; config.onContinue?.(); }, previewStage: config.previewStage }) }) });
  } else if (view === 'room') {
    component = jsx(OriginalEntry, {});
  } else throw Error('Unknown original renderer view: ' + view);
  const content = jsx(shared.aCt, { scope: initial.QOr, value: thread, children: jsx(shared.aCt, { scope: initial.MOr, value: route, children: component }) });
  const localAuth = config.auth ?? adapterModule.localAuth;
  const tree = jsx(Boundary, { children: jsx(shared.Ist, { client: queryClient, children: jsx(shared.sCt, { queryClient, children: jsx(shared.aCt, { scope: shared.Qst, value: config.appScopeValue ?? {}, children: jsx(initial._mr, { value: localAuth, children: jsx(shared.$Ot, { locale, defaultLocale: 'en-US', messages, children: jsx(CaptureScope, { children: content }) }) }) }) }) }) });
  const root = document.getElementById('root');
  if (!root) throw Error('Missing original host root');
  diagnostics.root = ReactDOM.createRoot(root);
  diagnostics.router = shared.kSt([{ path: '*', element: jsx(initial.Pw, { children: tree }) }], { initialEntries: ['/dots/home'] });
  diagnostics.root.render(jsx(shared.ESt, { router: diagnostics.router }));
} catch (error) {
  report(error);
  const root = document.getElementById('root');
  if (root) { const failure = document.createElement('pre'); failure.setAttribute('role', 'alert'); failure.style.whiteSpace = 'pre-wrap'; failure.textContent = 'Original renderer host: ' + String(error?.message ?? error); root.replaceChildren(failure); }
}
