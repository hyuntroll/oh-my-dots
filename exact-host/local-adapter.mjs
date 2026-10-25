import { approvalMessages, inspectApproval, respondApproval } from './local-approvals.mjs';
import { readOnlyLocalPluginRpc, localPluginMcpServers } from './local-plugins.mjs';
// Transport/data boundary for the unmodified shipped Dots components.
// This is a local backend, never a ChatGPT account or a cloud session.
export const LOCAL_ACCOUNT_ID = 'local';
export const LOCAL_USER_ID = 'local-user';
export const localAuth = Object.freeze({
  accountId: LOCAL_ACCOUNT_ID, authenticatedAccountId: LOCAL_ACCOUNT_ID,
  userId: LOCAL_USER_ID, authenticatedUserId: LOCAL_USER_ID,
  accountUserId: LOCAL_USER_ID, accountLoading: false, authLoading: false,
  accountStructure: 'personal', authMethod: 'local', hasChatGptToken: false,
  requiresAuth: false, supportedSurface: true, email: null, plan: null,
  isLoading: false, openAIAuth: null,
});

const metadataKey = 'dots-exact-local-metadata-v1';
const encode = encodeURIComponent;
const missing = (message, status = 404) => Object.assign(new Error(message), { status, responseStatus: status, explicitResponseStatus: status, retryable: false });
// The earlier local backend stores the most recent TASK id in its
// active_root_thread_id field. A room route needs a stable root identity across
// tasks, so this adapter deliberately uses a local profile-to-thread alias.
const nativeThread = profile => 'local-dot-' + profile.id;
const artifactMime = path => ({ txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown',
  json: 'application/json', csv: 'text/csv', html: 'text/html', htm: 'text/html',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml',
  pdf: 'application/pdf', zip: 'application/zip' })[path.split('.').at(-1)?.toLowerCase()] || 'application/octet-stream';
const metadata = {
  read() { try { return JSON.parse(localStorage.getItem(metadataKey) || '{}'); } catch { return {}; } },
  get(id) { return this.read()[id] || {}; },
  set(id, patch) { const rows = this.read(); rows[id] = { ...rows[id], ...patch }; localStorage.setItem(metadataKey, JSON.stringify(rows)); },
};

export function localAccountIdentity() {
  return { id: LOCAL_USER_ID, name: metadata.get('local-account').name || '로컬 사용자', email: null, picture: null };
}

export function originalProfile(profile) {
  const extra = metadata.get(profile.id);
  const avatarType = extra.avatar_type || (extra.avatar_manifest ? 'rendered-interactive' : undefined);
  const nativeAvatar = avatarType === 'rendered-interactive' || avatarType === 'codex-pet';
  return {
    ...profile, ...extra,
    aeon_kind: 'orbit', status: profile.deleted_at ? 'deleting' : 'active',
    messaging_room_id: profile.room_id,
    active_root_thread_id: nativeThread(profile), root_thread_id: nativeThread(profile),
    updated_at: profile.updated_at || profile.created_at,
    // Avatar identifiers belong to the original renderer. The local backend's
    // old reconstructed preset names are not original avatar identifiers.
    // A native manifest and a legacy preset ID are mutually exclusive in the
    // original snapshot protocol. HMn.avatarId takes precedence and disables
    // Pac's native state even when a valid manifest is also present.
    avatar: nativeAvatar ? null : extra.avatar || 'sunglasses',
    avatar_id: nativeAvatar ? null : extra.avatar_id || extra.avatar || 'sunglasses',
    // The shipped renderer suppresses its preset fallback for this type. Only
    // advertise an interactive avatar after an actual native manifest exists.
    avatar_type: avatarType,
    accent_color: extra.accent_color || 'pink',
    local_backend: true,
  };
}

export function originalMessage(message, profile) {
  const common = {
    id: message.id, room_id: message.room_id,
    created_at: message.created_at, updated_at: message.updated_at || message.created_at,
    request_id: message.request_id || null, task_id: message.task_id || null,
    reply_to: message.reply_to || null, reactions: {},
    content: { text: message.content?.text || '', attachments: [] },
    message_metadata: message.message_metadata,
  };
  if (message.local_approval_id) return { ...common, role: 'user', account_user_id: 'local-dot-user-' + profile.id,
    content: { ...common.content, elicitation: message.content.elicitation } };
  if (message.role === 'assistant') {
    return { ...common, role: 'assistant', account_user_id: 'local-dot-user-' + profile.id,
      aeon_id: profile.id, raw_messages: [{ id: message.id, author: { role: 'assistant' },
        content: { content_type: 'text', parts: [message.content?.text || ''] }, metadata: {} }], attachments: [] };
  }
  if (message.role === 'system') return { ...common, role: 'system', content: { ...common.content, type: 'local_task_status' } };
  return { ...common, role: message.role, account_user_id: LOCAL_USER_ID };
}

function roomMessages(roomId, state, stored = state.messages) {
  const messages = [...stored.filter(message => message.room_id === roomId), ...approvalMessages(roomId, state)];
  // The original timeline understands system messages. Surface a persisted
  // local runtime failure there, rather than fabricating an assistant answer
  // or leaving a successfully delivered request apparently still running.
  for (const task of state.tasks.filter(task => task.room_id === roomId && task.status === 'error' && task.error)) {
    messages.push({ id: 'local-task-error-' + task.id, room_id: roomId, role: 'system',
      task_id: task.id, created_at: task.updated_at || task.created_at,
      content: { text: 'Local runtime: ' + String(task.error) } });
  }
  return messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function originalActivity(task) {
  const inProgress = ['queued', 'in_progress', 'needs_input', 'paused'].includes(task.status);
  return { thread_id: task.id, parent_thread_id: null, title: task.title || null,
    image_url: null, emoji: null, status: inProgress ? 'in_progress' : 'completed',
    outcome: inProgress ? null : task.status === 'completed' ? 'succeeded' : ['cancelled', 'interrupted'].includes(task.status) ? 'interrupted' : 'failed',
    created_at: Date.parse(task.created_at) / 1000,
    updated_at: Date.parse(task.updated_at || task.created_at) / 1000,
    preview: { turn_id: task.id, text: task.items?.filter(item => item.type === 'text').at(-1)?.text || null },
  };
}

function originalTask(task) {
  return { id: task.id, title: task.title || '', description: null, emoji: null,
    status: task.status, latest_update: task.error || task.items?.filter(item => item.type === 'text').at(-1)?.text || null,
    created_at: task.created_at, updated_at: task.updated_at || task.created_at };
}

function originalRoom(room, state) {
  const profile = state.profiles.find(row => row.id === room.profile_id);
  if (!profile) throw missing('Local Dot no longer exists');
  const p = originalProfile(profile);
  const members = [
    { account_user_id: LOCAL_USER_ID, name: 'You', username: '', avatar_url: '', aeon_id: null },
    { account_user_id: 'local-dot-user-' + p.id, name: p.display_name, username: '', avatar_url: '', aeon_id: p.id,
      avatar_manifest: p.avatar_manifest, avatar_type: p.avatar_type, avatar_id: p.avatar_id },
  ];
  const messages = roomMessages(room.id, state).map(row => originalMessage(row, p));
  return { id: room.id, type: 'DM', app_source: 'chatgpt:messaging', aeon_id: p.id,
    name: p.display_name, members, member_profile_snapshots: members,
    latest_messages: messages.slice(-20), latest_message: messages.at(-1) || null,
    dm_lifecycle_state: 'connected', last_read_at: metadata.get('room:' + room.id).last_read_at || null,
    created_at: p.created_at, updated_at: messages.at(-1)?.created_at || p.updated_at,
    read_receipts: [], user_room_settings: { notification_setting: 'active' } };
}

export async function installLocalAdapter({ initial, scope, queryClient, shared, fetch: fetchImpl = globalThis.fetch.bind(globalThis) }) {
  const diagnostics = { mode: 'local', requests: [], errors: [], revision: 0 };
  let state, refreshPromise, disposed = false, source, refreshTimer;
  const subscriptions = new Set();
  const activityStreams = new Set();
  const originalMethods = new Map();
  let restoreBinaryFetch;
  const loggedWarnings = new Set();
  let loggedCapability;
  function warn(key, fields) {
    if (loggedWarnings.has(key) || loggedWarnings.size >= 20) return;
    loggedWarnings.add(key);
    console.warn('[dots-local-adapter]', JSON.stringify(fields));
  }
  const settingsListeners = new Map();
  const seededIdentities = new Map();
  const loggedAppearances = new Map();
  const connectionStates = new Map();
  const settingsSnapshot = () => {
    const values = { conversationDetailMode: 'STEPS_PROSE', ...metadata.get('settings') };
    return { values, configuredValues: { ...values } };
  };
  const settingsService = {
    async readAll() { return settingsSnapshot(); },
    async read(key) { const value = settingsSnapshot().values[key]; return { effective: value, configured: value }; },
    async write(key, value) {
      metadata.set('settings', { [key]: value });
      for (const listener of settingsListeners.get(key) || []) listener({ effective: value, configured: value });
      return { effective: value, configured: value };
    },
    async subscribe(key, listener) {
      let listeners = settingsListeners.get(key);
      if (!listeners) settingsListeners.set(key, listeners = new Set());
      listeners.add(listener);
      return { [Symbol.dispose]() { listeners.delete(listener); } };
    },
  };
  const accountCapability = { accounts: { [LOCAL_ACCOUNT_ID]: { account: {
    account_id: LOCAL_ACCOUNT_ID, account_user_id: LOCAL_USER_ID, structure: 'personal',
    tbo_config: { tbo_available: true }, local_backend: true,
  } } }, account_ordering: [LOCAL_ACCOUNT_ID] };
  initial.ExactUseLocalAccountInputs?.();
  initial.ExactSetLocalAccountQuery?.(accountId => {
    if (accountId !== LOCAL_ACCOUNT_ID) throw missing('This adapter has no cloud account', 403);
    return accountCapability;
  });
  const api = async (path, { method = 'GET', body, signal } = {}) => {
    if (!path.startsWith('/api/')) throw missing('Only local /api requests are permitted', 400);
    const response = await fetchImpl(path, { method, credentials: 'omit', signal,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const value = await response.json();
    if (!response.ok) {
      warn('api:' + response.status + ':' + path, { method, path, status: response.status });
      throw missing(value.error || value.message || 'Local backend request failed', response.status);
    }
    return value;
  };
  shared?.Oit?.(); // Original WebFetch class initializer (axt).
  if (shared?.Eit?.getInstance) {
    const webFetch = shared.Eit.getInstance(), originalFetch = webFetch.fetch;
    let binaryReads = 0;
    const localFetch = async (target, options = {}) => {
      options.signal?.throwIfAborted();
      options.assertRequestCurrent?.();
      const origin = globalThis.location?.origin || 'http://127.0.0.1:3420';
      const url = new URL(target, origin), method = options.method || 'GET';
      if (url.origin !== origin || url.username || url.password || method !== 'GET'
        || !(/^\/api\/tasks\/[^/]+\/artifacts$/.test(url.pathname) || /^\/api\/local-avatars\/local-avatar-[0-9a-f-]{36}$/.test(url.pathname))) {
        warn('binary:' + method + ':' + url.pathname, { event: 'unsupported-original-binary-fetch', method, path: url.pathname, status: 501 });
        throw missing('Original binary resource is not connected to the local backend', 501);
      }
      // Original EN/Blob consumers require an actual Response. Their native
      // httpFetch service is absent here; only owned local file bytes use this
      // browser transport. No cloud account headers or cookies are forwarded.
      const response = await fetchImpl(url.pathname + url.search, { method, credentials: 'omit', signal: options.signal });
      if (binaryReads++ < 8) console.info('[dots-local-adapter]', JSON.stringify({ event: 'local-binary-read', method, path: url.pathname, status: response.status }));
      if (!response.ok) throw missing('Local file download failed', response.status);
      options.onResponseHeaders?.(response.headers);
      return response;
    };
    webFetch.fetch = localFetch;
    restoreBinaryFetch = () => { if (webFetch.fetch === localFetch) webFetch.fetch = originalFetch; };
  }
  function setLocalConnection(connected) {
    if (!initial.Ver) return;
    for (const hostId of ['local', 'durable']) {
      const value = connected ? 'connected' : 'disconnected';
      if (connectionStates.get(hostId) === value) continue;
      try {
        initial.Ver(scope, { hostId, state: value, error: null, source: 'local-dots-adapter' });
        connectionStates.set(hostId, value);
      } catch { /* Native diagnostics cannot break local data loading. */ }
    }
  }
  function seed() {
    if (!scope || !state) return;
    scope.set(initial.VRr, localAuth);
    // Select the shipped room/catalog implementation. These flags choose a
    // client implementation; its transport still terminates locally below.
    if (initial.uBr) {
      scope.set(initial.uBr, 'codex-app-aeon-cloud-mode', true);
      scope.set(initial.uBr, '2929219922', true);
    }
    if (initial.mBr) scope.set(initial.mBr, false);
    shared?.oit?.();
    if (shared?.bit) queryClient.setQueryData(shared.bit('get-settings'), settingsSnapshot());
    const profiles = state.profiles.map(originalProfile);
    // This describes the local adapter capability. It is never sent to or
    // accepted from a cloud service and grants no external account access.
    queryClient.setQueryData(['usage-settings', 'accounts-check', 'v4-2023-04-27', LOCAL_ACCOUNT_ID, LOCAL_USER_ID], accountCapability);
    queryClient.setQueryData(['cloud-aeon-profiles', LOCAL_ACCOUNT_ID, LOCAL_USER_ID], profiles);
    for (const profile of profiles) {
      // "durable" here is the original client's persistent-Dot execution
      // category. This factory, its data, and every request remain local.
      initial.Ber?.(scope, profile.active_root_thread_id, 'durable');
      // Original identity metadata chooses the interactive Dot editor over its
      // legacy static-avatar picker. The host owns this persisted atom store;
      // it is separate from the installed application's account/settings data.
      if (initial.BLr) {
        const signature = JSON.stringify([profile.avatar, profile.accent_color]);
        if (seededIdentities.get(profile.id) !== signature) {
          seededIdentities.set(profile.id, signature);
          for (const hostId of ['local', 'durable']) initial.BLr('aeon-is-orbit-v1:' + JSON.stringify([LOCAL_ACCOUNT_ID, { hostId, threadId: profile.active_root_thread_id }]), true);
          const appearanceKey = 'aeon-appearance-v2:' + profile.active_root_thread_id;
          // Preserve the original save controller's version/sync record. A
          // startup default must not replace a saved native appearance atom.
          if (initial.ILr?.(appearanceKey, null) == null) initial.BLr(appearanceKey, { avatar: profile.avatar, color: profile.accent_color });
        }
      }
      queryClient.setQueryData(['cloud-aeon', LOCAL_ACCOUNT_ID, LOCAL_USER_ID, profile.id], profile);
      queryClient.setQueryData(['cloud-aeon-by-thread', LOCAL_ACCOUNT_ID, LOCAL_USER_ID, profile.active_root_thread_id], profile);
      let nativeStateBytes = 0;
      if (profile.avatar_manifest && initial.Evr) {
        try { initial.Dvr?.(); nativeStateBytes = initial.Evr(profile.avatar_manifest)?.length || 0; } catch { /* Report a missing native state without exposing manifest data. */ }
      }
      const savedSync = initial.ILr?.('aeon-appearance-v2:' + profile.active_root_thread_id, null)?.cloudAvatarSync;
      let originalAvatar;
      try { if (initial.y9) originalAvatar = scope.get(initial.y9, profile.active_root_thread_id); } catch { /* Optional original selector diagnostics only. */ }
      const appearance = { event: 'local-avatar', profileId: profile.id,
        avatarType: profile.avatar_type || 'preset', hasManifest: !!profile.avatar_manifest,
        hasAppearance: !!profile.avatar_manifest?.appearance, hasSnapshot: !!profile.avatar_manifest?.snapshot,
        nativeStateBytes,
        pendingSavedAppearance: savedSync?.pending?.expiresAtMs > Date.now(),
        profileOlderThanSavedSync: savedSync?.profileId === profile.id && Date.parse(profile.updated_at) < Date.parse(savedSync?.updatedAt),
        originalCanvasEligible: originalAvatar?.renderCanvas ?? null, originalStateBytes: originalAvatar?.state?.length ?? null,
        hasLocalSnapshot: profile.avatar_manifest?.snapshot?.asset_pointer?.startsWith('file-service://local-avatar-')
          ? !!metadata.get('asset:' + profile.avatar_manifest.snapshot.asset_pointer.slice('file-service://'.length)).dataUrl : false };
      const appearanceSignature = JSON.stringify(appearance);
      if (loggedAppearances.get(profile.id) !== appearanceSignature) {
        loggedAppearances.set(profile.id, appearanceSignature);
        console.info('[dots-local-adapter]', appearanceSignature);
      }
      const tasks = state.tasks.filter(task => task.profile_id === profile.id).map(originalTask).reverse();
      queryClient.setQueryData(['orbit-task-history', LOCAL_ACCOUNT_ID, LOCAL_USER_ID, profile.id, 'tasks'], { pages: [{ data: tasks, next_cursor: null }], pageParams: [''] });
      for (const task of tasks) queryClient.setQueryData(['orbit-task-history', LOCAL_ACCOUNT_ID, LOCAL_USER_ID, profile.id, 'task', task.id], task);
      const threadIds = [profile.active_root_thread_id, ...tasks.map(task => task.id)];
      for (const hostId of ['local', 'durable']) queryClient.setQueryData(['aeon-output-threads', profile.active_root_thread_id, LOCAL_ACCOUNT_ID, LOCAL_USER_ID, hostId], { accountId: LOCAL_ACCOUNT_ID, hostId, threadIds, userId: LOCAL_USER_ID });
      const task = state.tasks.filter(task => task.profile_id === profile.id).at(-1);
      const active = task && ['queued', 'in_progress', 'needs_input'].includes(task.status);
      const paused = profile.is_paused || task?.status === 'paused';
      const failed = task?.status === 'error';
      const tool = task?.items?.filter(item => item.type === 'tool_call').at(-1);
      const activity = paused ? 'Paused' : failed ? 'Error' : task?.status === 'needs_input' ? 'Needs Input' : active ? tool?.status === 'in_progress' ? 'Working' : 'Thinking' : 'Ready';
      if (initial.Hyr) scope.set(initial.Hyr, profile.active_root_thread_id, paused ? 'stopped' : failed ? 'failed' : active ? 'working' : 'sleeping');
      initial.ExactSetLocalRoomLive?.(scope, profile.messaging_room_id, {
        type: 'calpico-room-live-state', version: 1, room_id: profile.messaging_room_id,
        subscription_id: 'local-room-' + profile.messaging_room_id, revision: state.revision,
        threads: [{ thread_id: profile.active_root_thread_id, stream_state: 'attached',
          turn_id: task?.id || null,
          turn_status: failed ? 'failed' : active || paused ? 'in_progress' : task?.status === 'cancelled' || task?.status === 'interrupted' ? 'interrupted' : 'completed',
          is_active: !!active, activity_status: { status_type: activity, status_label: active ? task.title || activity : activity },
          ...(tool?.status === 'in_progress' && tool.name?.startsWith('computer_') ? { computer_status: 'using_computer' } : {}),
        }],
      });
    }
    const primary = profiles[0];
    queryClient.setQueryData(['primary-aeon', LOCAL_ACCOUNT_ID, LOCAL_USER_ID], primary
      ? { selection: { available: true, aeon_id: primary.id, thread_id: primary.active_root_thread_id }, profile: primary }
      : { selection: null, profile: null });
    if (initial.ExactSetLocalOutputs) {
      const rows = [];
      for (const task of state.tasks) {
        const profile = profiles.find(profile => profile.id === task.profile_id);
        if (!profile) continue;
        for (const item of task.items || []) {
          if (item.type !== 'artifact' || typeof item.path !== 'string') continue;
          const artifact = { type: 'message-file', roomId: task.room_id, fileId: 'local-artifact-' + item.id,
            name: item.path.split('/').at(-1), mimeType: artifactMime(item.path), sizeBytes: null,
            producedAtMs: Date.parse(task.updated_at || task.created_at) };
          for (const hostId of ['local', 'durable']) rows.push({ accountId: LOCAL_ACCOUNT_ID, userId: LOCAL_USER_ID,
            hostId, threadId: profile.active_root_thread_id, messageId: 'local-artifact-' + task.id + ':' + item.path,
            artifact: { ...artifact, source: { conversationId: profile.active_root_thread_id, hostId } } });
        }
      }
      initial.ExactSetLocalOutputs(scope, rows);
    }
    diagnostics.revision = state.revision;
    try {
      const capability = initial.Fjr ? scope.get(initial.Fjr) : null;
      const fields = { event: 'local-capability', identityReady: scope.get(initial.zRr) === LOCAL_ACCOUNT_ID,
        accountQuerySuccess: queryClient.getQueryState(['usage-settings', 'accounts-check', 'v4-2023-04-27', LOCAL_ACCOUNT_ID, LOCAL_USER_ID])?.status === 'success',
        nativeAccountInputError: initial.Qzr ? scope.get(initial.Qzr) : null,
        isCapable: capability?.isCapable, isLoading: capability?.isLoading, isError: capability?.isError };
      const serialized = JSON.stringify(fields);
      if (serialized !== loggedCapability) { loggedCapability = serialized; console.info('[dots-local-adapter]', serialized); }
    } catch { /* Debugging must not interfere with the local data boundary. */ }
  }
  async function refresh() {
    if (!refreshPromise) refreshPromise = api('/api/state').then(value => {
      state = value; seed(); setLocalConnection(true);
      for (const stream of activityStreams) for (const task of state.tasks.filter(row => row.profile_id === stream.profileId)) stream.emit('upsert', originalActivity(task));
      return state;
    }).catch(error => { setLocalConnection(false); throw error; }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  function emit(update) { for (const sub of subscriptions) sub.onUpdate?.(update); }
  const currentProfile = id => state.profiles.find(p => p.id === id || nativeThread(p) === id);
  const currentRoom = id => state.rooms.find(room => room.id === id);
  const profileOrThrow = id => currentProfile(id) || (() => { throw missing('Local Dot not found'); })();
  const roomOrThrow = id => currentRoom(id) || (() => { throw missing('Local messaging room not found'); })();
  async function dispatch(method, template, options = {}) {
    options.signal?.throwIfAborted();
    let path = template.replace(/\{([^}]+)\}/g, (_, key) => encode(options.parameters?.path?.[key] ?? ''));
    const body = options.requestBody || {}, query = options.parameters?.query || {};
    diagnostics.requests.push({ method, path, at: Date.now() });
    if (diagnostics.requests.length > 100) diagnostics.requests.shift();
    if (!state) await refresh();
    let match;
    if (method === 'GET' && path === '/me') return localAccountIdentity();
    if (method === 'GET' && path === '/profiles/me') return {
      user_id: LOCAL_USER_ID, profile_details: { display_name: localAccountIdentity().name, username: null },
      viewer_access: { can_edit: false }, local_backend: true,
    };
    if (method === 'GET' && path === '/wham/profiles/me') return {
      profile: { display_name: localAccountIdentity().name, username: null, profile_picture_url: null },
      stats: {}, metadata: { stats_error: 'Cloud usage is unavailable in local mode' }, local_backend: true,
    };
    if (method === 'PATCH' && path === '/accounts/users/name') {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) throw missing('이름을 1~100자로 입력하세요.', 400);
      metadata.set('local-account', { name: body.name.trim() });
      return localAccountIdentity();
    }
    // The standalone local installation has no connected cloud apps or hosted
    // plugins. These are truthful empty LOCAL inventories, not success replies
    // to an install, authentication, or external account operation.
    if (method === 'GET' && path === '/ps/plugins/installed') return { plugins: [], pagination: { next_page_token: null }, local_backend: true };
    if (method === 'POST' && path === '/aip/connectors/batch') return { connectors: [], local_backend: true };
    if (method === 'GET' && path === '/aip/workspace/connector-recommendation') return { connector_id: null, mx_provider: null, local_backend: true };
    if (method === 'POST' && path === '/aip/connectors/links/list_accessible') return { links: [], local_backend: true };
    if (method === 'GET' && path === '/tbo') return { items: state.profiles.map(originalProfile), cursor: null };
    if (method === 'GET' && path === '/tbo/primary') {
      const p = state.profiles[0];
      return p ? { selection: { available: true, aeon_id: p.id, thread_id: nativeThread(p) }, profile: originalProfile(p) } : { selection: null, profile: null };
    }
    if (method === 'POST' && path === '/tbo') {
      const p = await api('/api/profiles', { method: 'POST', signal: options.signal, body: {
        display_name: body.display_name?.trim() || 'dot', description: body.description || '',
        preset: 'alfred', request_id: body.request_id || crypto.randomUUID(),
      } });
      await refresh();
      return originalProfile(p);
    }
    if ((match = path.match(/^\/tbo\/([^/]+)\/automations$/)) && method === 'GET') {
      profileOrThrow(decodeURIComponent(match[1]));
      return { items: [], cursor: null, local_backend: true };
    }
    if ((match = path.match(/^\/tbo\/([^/]+)\/threads$/)) && method === 'GET') {
      const profile = profileOrThrow(decodeURIComponent(match[1]));
      return { items: [{ thread_id: nativeThread(profile), parent_thread_id: null, aeon_kind: 'orbit', is_user_visible: true }], cursor: null };
    }
    if ((match = path.match(/^\/tbo\/([^/]+)\/environment\/(status|recreate|start)$/))) {
      profileOrThrow(decodeURIComponent(match[1]));
      if (method === 'POST' && ['recreate', 'start'].includes(match[2])) await api('/api/computer/start', { method: 'POST', body: {}, signal: options.signal });
      else if (method !== 'GET' || match[2] !== 'status') throw missing('Unsupported local computer operation', 501);
      const computer = await api('/api/computer/status', { signal: options.signal });
      const status = computer.connected ? 'ready' : computer.state === 'starting' ? 'starting' : computer.state === 'failed' ? 'failed' : 'offline';
      return { environmentId: 'local-desktop', status, capabilities: [{ type: 'remote_desktop', status }], local_backend: true, error: computer.error || null };
    }
    if ((match = path.match(/^\/tbo\/([^/]+)\/activity$/)) && method === 'GET') {
      const p = profileOrThrow(decodeURIComponent(match[1]));
      return { data: state.tasks.filter(task => task.profile_id === p.id).map(originalActivity).reverse(), next_cursor: null };
    }
    if ((match = path.match(/^\/tbo\/([^/]+)\/tasks(?:\/([^/]+))?$/)) && method === 'GET') {
      const p = profileOrThrow(decodeURIComponent(match[1]));
      const tasks = state.tasks.filter(task => task.profile_id === p.id);
      if (match[2]) {
        const task = tasks.find(task => task.id === decodeURIComponent(match[2]));
        if (!task) throw missing('Local task not found');
        return originalTask(task);
      }
      return { data: tasks.map(originalTask).reverse(), next_cursor: null };
    }
    if (method === 'POST' && path === '/cloud-aeons/avatar-snapshots') {
      if (!(body instanceof FormData)) throw missing('Local avatar upload requires a file', 400);
      const file = body.get('file');
      if (!(file instanceof Blob) || file.type !== 'image/png' || file.size > 2e6) throw missing('Local avatar snapshot must be a PNG smaller than 2 MB', 400);
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
      const id = 'local-avatar-' + crypto.randomUUID();
      await api('/api/local-avatars', { method: 'POST', signal: options.signal, body: { file_id: id, data_url: dataUrl } });
      metadata.set('asset:' + id, { dataUrl, created_at: new Date().toISOString() });
      return { snapshot: { schema_version: 1, asset_pointer: 'file-service://' + id } };
    }
    if ((match = path.match(/^\/files\/download\/([^/]+)$/)) && method === 'GET') {
      const asset = metadata.get('asset:' + decodeURIComponent(match[1]));
      if (!asset.dataUrl) throw missing('Local avatar asset not found');
      return { status: 'success', download_url: new URL('/api/local-avatars/' + encode(decodeURIComponent(match[1])), globalThis.location?.origin || 'http://127.0.0.1:3420').href };
    }
    if ((match = path.match(/^\/tbo\/by-thread\/([^/]+)$/)) && method === 'GET') return originalProfile(profileOrThrow(decodeURIComponent(match[1])));
    if ((match = path.match(/^\/tbo\/([^/]+)(?:\/(messaging-room|pause|resume))?$/))) {
      const p = profileOrThrow(decodeURIComponent(match[1]));
      if (method === 'GET' || match[2] === 'messaging-room') return originalProfile(p);
      if (method === 'PATCH' || method === 'PUT' || ['pause', 'resume'].includes(match[2])) {
        const patch = Object.fromEntries(['display_name', 'description', 'is_paused'].filter(k => k in body).map(k => [k, body[k]]));
        if (match[2]) patch.is_paused = match[2] === 'pause';
        const extra = Object.fromEntries(['avatar', 'avatar_id', 'avatar_type', 'avatar_manifest', 'accent_color', 'appearance'].filter(k => k in body).map(k => [k, body[k]]));
        // Persist original renderer metadata only after the server mutation succeeds.
        const value = await api('/api/profiles/' + encode(p.id), { method: 'PATCH', body: patch, signal: options.signal });
        metadata.set(p.id, extra); await refresh(); return originalProfile(value);
      }
      if (method === 'DELETE') { await api('/api/profiles/' + encode(p.id), { method, signal: options.signal }); await refresh(); return; }
    }
    if ((match = path.match(/^\/messaging\/rooms\/([^/]+)$/)) && method === 'GET') return originalRoom(roomOrThrow(decodeURIComponent(match[1])), state);
    if ((match = path.match(/^\/messaging\/rooms\/([^/]+)\/files\/([^/]+)$/)) && method === 'GET') {
      const room = roomOrThrow(decodeURIComponent(match[1])), fileId = decodeURIComponent(match[2]);
      await refresh();
      for (const task of state.tasks.filter(task => task.room_id === room.id)) {
        const item = task.items?.find(item => item.type === 'artifact' && 'local-artifact-' + item.id === fileId);
        if (!item || typeof item.path !== 'string') continue;
        const url = new URL('/api/tasks/' + encode(task.id) + '/artifacts', globalThis.location?.origin || 'http://127.0.0.1:3420');
        url.searchParams.set('path', item.path);
        return { id: fileId, name: item.path.split('/').at(-1), mime_type: artifactMime(item.path),
          download_url: url.href, library_file_id: null };
      }
      throw missing('Local artifact not found');
    }
    if ((match = path.match(/^\/messaging\/rooms\/([^/]+)\/messages$/))) {
      const room = roomOrThrow(decodeURIComponent(match[1])), p = profileOrThrow(room.profile_id);
      if (method === 'GET') {
        // Read the persisted room directly so a just-sent reply is not hidden by a stale cache.
        const rows = await api('/api/rooms/' + encode(room.id) + '/messages', { signal: options.signal });
        let messages = roomMessages(room.id, state, rows).filter(row => !query.task_id || row.task_id === query.task_id);
        if (query.before) { const index = messages.findIndex(row => row.id === query.before); if (index >= 0) messages = messages.slice(0, index); }
        if (query.after) { const index = messages.findIndex(row => row.id === query.after); if (index >= 0) messages = messages.slice(index + 1); }
        const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
        const selected = query.after ? messages.slice(0, limit) : messages.slice(-limit);
        return { items: selected.map(row => originalMessage(row, p)), prev_cursor: selected.length < messages.length ? selected[0]?.id : null, next_cursor: null };
      }
      if (method === 'POST') {
        if (body.content?.attachments?.length) throw missing('Attachments are not connected to the local backend yet', 501);
        const value = await api('/api/messaging/rooms/' + encode(room.id) + '/messages', { method, signal: options.signal, body: {
          ...body, request_id: body.request_id, idempotency_token: body.idempotency_token || body.request_id,
        } });
        await refresh();
        return originalMessage(value.message, p);
      }
    }
    if ((match = path.match(/^\/messaging\/rooms\/([^/]+)\/messages\/([^/]+)\/elicitation(?:\/(response))?$/))) {
      const roomId = decodeURIComponent(match[1]), messageId = decodeURIComponent(match[2]);
      roomOrThrow(roomId);
      if (method === 'GET' && !match[3]) {
        await refresh();
        return inspectApproval(state, roomId, messageId);
      }
      if (method === 'POST' && match[3] === 'response') return respondApproval({ state: () => state, roomId, messageId, body, api, refresh, signal: options.signal });
    }
    if ((match = path.match(/^\/messaging\/rooms\/([^/]+)\/(?:read|mark-read|read-cursor|read_cursor)$/)) && method === 'POST') {
      const room = roomOrThrow(decodeURIComponent(match[1]));
      metadata.set('room:' + room.id, { last_read_at: body.last_read_at || body.timestamp || new Date().toISOString() });
      emit({ type: 'room', roomId: room.id }); return { last_read_at: metadata.get('room:' + room.id).last_read_at };
    }
    if (/^\/messaging\/rooms\/[^/]+\/responding_heartbeat$/.test(path)) {
      // Typing presence is local transient state, not a claimed cloud delivery.
      return {};
    }
    const error = missing('Original service is not connected to the local backend: ' + method + ' ' + path, 501);
    diagnostics.errors.push(error.message);
    warn('unknown:' + method + ':' + path, { event: 'unsupported-original-service', method, path, status: 501 });
    throw error;
  }
  // All original account/network requests terminate at this local boundary.
  // Unknown endpoints fail closed rather than claiming a cloud operation succeeded.
  for (const [method, name] of [['GET', 'safeGet'], ['POST', 'safePost'], ['PATCH', 'safePatch'], ['PUT', 'safePut'], ['DELETE', 'safeDelete']]) {
    originalMethods.set(name, initial.iRr[name]);
    initial.iRr[name] = (path, options) => dispatch(method, path, options);
  }
  originalMethods.set('getResponse', initial.iRr.getResponse);
  initial.iRr.getResponse = async (template, options = {}) => {
    const path = template.replace(/\{([^}]+)\}/g, (_, key) => encode(options.parameters?.path?.[key] ?? ''));
    const match = path.match(/^\/tbo\/([^/]+)\/activity\/stream$/);
    if (!match) throw missing('Original stream is not connected to the local backend: ' + path, 501);
    if (!state) await refresh();
    const profile = profileOrThrow(decodeURIComponent(match[1]));
    let cleanup;
    const body = new ReadableStream({
      start(controller) {
        const emit = (event, data) => { try { controller.enqueue(new TextEncoder().encode('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n')); } catch { cleanup?.(); } };
        const entry = { profileId: profile.id, emit };
        cleanup = () => { activityStreams.delete(entry); options.signal?.removeEventListener('abort', onAbort); };
        const onAbort = () => { cleanup(); try { controller.close(); } catch {} };
        activityStreams.add(entry);
        options.signal?.addEventListener('abort', onAbort, { once: true });
        if (options.signal?.aborted) return onAbort();
        emit('snapshot', { data: state.tasks.filter(task => task.profile_id === profile.id).map(originalActivity), next_cursor: null });
      },
      cancel() { cleanup?.(); },
    });
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  };
  // Older adapter versions retained original PNG snapshots only in their own
  // browser metadata. Migrate those exact bytes to immutable local HTTP assets
  // before children render: the original image resolver requires HTTP(S).
  // Repeating the idempotent write also handles a replaced local backend store.
  await Promise.all(Object.entries(metadata.read()).filter(([key, value]) =>
    /^asset:local-avatar-[0-9a-f-]{36}$/.test(key) && typeof value?.dataUrl === 'string'
      && value.dataUrl.startsWith('data:image/png;base64,')
  ).map(([key, value]) => api('/api/local-avatars', { method: 'POST', body: { file_id: key.slice('asset:'.length), data_url: value.dataUrl } })));
  await refresh();
  const localManagers = new Map();
  function localManager(_scope, hostId) {
    if (localManagers.has(hostId)) return localManagers.get(hostId);
    const methods = {
      async resumeConversation(options) {
        const current = await refresh();
        const profile = current.profiles.find(row => nativeThread(row) === options.conversationId);
        if (!profile || !current.rooms.some(room => room.id === profile.room_id && room.profile_id === profile.id)) throw missing('Local Dot room is not ready', 409);
        // Readiness is backed by an actual local profile and room; this never
        // claims that the original cloud server resumed or executed a thread.
        return { status: 'ready' };
      },
      async sendRequest(name) {
      const pluginResult = readOnlyLocalPluginRpc(name, { model: state.settings?.model });
      if (pluginResult !== undefined) return pluginResult;
      warn('rpc:' + name, { event: 'unsupported-native-rpc', method: name, status: 501 });
        throw missing('Native app-server operation is unavailable in the local backend: ' + name, 501);
      },
      async listMcpServers() { return localPluginMcpServers(); },
      async discoverSubagentDescendantSnapshot() { return { descendantThreads: [] }; },
      onRpcBroken() { return () => {}; },
      onRpcError() { return () => {}; },
      [Symbol.dispose]() {},
    };
    let manager;
    manager = new Proxy(methods, { get(target, key) {
      if (key === 'then') return undefined;
      if (key === 'dup') return () => manager;
      if (key === Symbol.toStringTag) return 'LocalDotsManager';
      if (key in target) return target[key];
      if (typeof key === 'symbol') return undefined;
      return async () => { warn('rpc:' + key, { event: 'unsupported-native-rpc', method: key, status: 501 }); throw missing('Native app-server operation is unavailable in the local backend: ' + key, 501); };
    } });
    localManagers.set(hostId, manager);
    return manager;
  }
  (initial.ExactSetLocalManagerFactory || initial.ExactSetExecutionManager)?.(localManager);
  // Original c4c.send contains cloud-only Sentinel/device attestation. A local
  // model request has no such service. Keep the original room/history parser
  // and UI controller, replacing only that send transport and its attestation
  // subscription. A returned message is always re-read from persisted data.
  initial.ExactAdaptMessagingClient?.((bundle, options) => {
    const client = bundle.client;
    client.send = async request => {
      options.signal?.throwIfAborted();
      if (request.attachmentIds?.length) throw missing('Attachments are not connected to the local backend yet', 501);
      const sent = await dispatch('POST', '/messaging/rooms/{room_id}/messages', {
        parameters: { path: { room_id: request.roomId } }, signal: options.signal,
        requestBody: { content: { text: request.text, attachments: [] }, request_id: request.requestId,
          idempotency_token: request.requestId, task_id: options.taskId,
          reply_to: request.replyToMessageId ? { message_id: request.replyToMessageId } : undefined },
      });
      const page = await client.messages(request.roomId, { limit: 100 });
      const projected = page.messages.find(message => message.id === sent.id);
      if (!projected) throw missing('The local send was stored, but its rendered message could not be read back', 503);
      return projected;
    };
    bundle.subscribeSendIntegrity = () => () => {};
    bundle.primeSendIntegrity = () => {};
    return bundle;
  });
  function subscribe(options) {
    subscriptions.add(options);
    options.onSubscribedChange?.(source?.readyState === 1);
    return () => subscriptions.delete(options);
  }
  initial.ExactSetMessagingSubscription?.(subscribe);
  if (typeof EventSource !== 'undefined') {
    source = new EventSource('/api/events?after=' + state.revision);
    source.onopen = () => { setLocalConnection(true); for (const sub of subscriptions) { sub.onSubscribedChange?.(true); sub.onUpdate?.({ type: 'resync' }); } };
    source.onerror = () => { setLocalConnection(false); for (const sub of subscriptions) sub.onSubscribedChange?.(false); };
    const onEvent = event => {
      if (disposed) return;
      let record; try { record = JSON.parse(event.data); } catch { return; }
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => refresh().then(() => {
        const data = record.value || record.data || {};
        if (record.type.startsWith('task.')) emit({ type: 'resync' });
        else if (data.room_id && record.type.startsWith('message.')) emit({ type: record.type === 'message.created' ? 'message-added' : 'message', roomId: data.room_id, messageId: data.id });
        else if (data.room_id) emit({ type: 'room', roomId: data.room_id });
        else for (const room of state.rooms) emit({ type: 'room', roomId: room.id });
      }).catch(error => diagnostics.errors.push(error.message)), 60);
    };
    for (const type of ['message.created', 'message.updated', 'task.created', 'task.updated', 'profile.created', 'profile.updated', 'profile.deleted', 'room.created']) source.addEventListener(type, onEvent);
  }
  return { accountId: LOCAL_ACCOUNT_ID, userId: LOCAL_USER_ID, auth: localAuth, diagnostics,
    get state() { return state; }, get profiles() { return state.profiles.map(originalProfile); },
    refresh, request: dispatch, subscribe, localManager, settingsService, originalProfile, originalMessage,
    async createDot(fields = {}) { return dispatch('POST', '/tbo', { requestBody: fields }); },
    dispose() { disposed = true; clearTimeout(refreshTimer); source?.close(); restoreBinaryFetch?.(); for (const [name, method] of originalMethods) initial.iRr[name] = method; subscriptions.clear(); activityStreams.clear(); },
  };
}
