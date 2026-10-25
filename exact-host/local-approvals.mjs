// Data projection for the SHIPPED messaging elicitation card (card-5c0779d33063).
// Its React markup, form controller, IndexedDB response claim, confirmation,
// and focus behavior remain original. Only its backend request data is local.
const messagePrefix = 'local-approval-';
const fail = (message, status = 409) => Object.assign(new Error(message), { status, responseStatus: status, explicitResponseStatus: status, retryable: false });
const rootId = profile => 'local-dot-' + profile.id;

function requestText(item) {
  switch (item.kind) {
    case 'grok': return item.question || 'Grok 도구 실행 승인이 필요합니다.';
    case 'question': return item.question || '답변이 필요합니다.';
    case 'write': return '파일을 작성하려고 합니다.\n\n경로: ' + item.path + '\n\n내용:\n' + item.content;
    case 'shell': return '명령을 실행하려고 합니다.\n\n' + item.command + (item.warning ? '\n\n' + item.warning : '');
    case 'peer_message': return (item.display_name || item.profile_id) + '에게 메시지를 보내려고 합니다.\n\n' + item.text;
    case 'computer': return '컴퓨터에서 작업을 수행하려고 합니다.\n\n' + JSON.stringify(item.args || { action: item.action }, null, 2);
    default: return '로컬 도구 실행 승인이 필요합니다.\n\n' + item.kind;
  }
}

export function requestStatus(task, item) {
  if (['allowed', 'denied'].includes(item.status)) return 'resolved';
  return item.status === 'pending' && task.status === 'needs_input' ? 'pending' : 'expired';
}

export function elicitationFor(task, item, profile) {
  const question = item.type === 'question';
  return { request_id: item.id, thread_id: rootId(profile), turn_id: task.id,
    status: requestStatus(task, item),
    params: { mode: 'form', serverName: 'dots', threadId: rootId(profile), turnId: task.id,
      message: requestText(item), requestedSchema: { type: 'object',
        properties: question ? { answer: { type: 'string', title: '답변', minLength: 1, maxLength: 10000 } } : {},
        required: question ? ['answer'] : [] } },
  };
}

export function approvalMessages(roomId, state) {
  const messages = [];
  for (const task of state.tasks.filter(task => task.room_id === roomId)) {
    const profile = state.profiles.find(profile => profile.id === task.profile_id);
    if (!profile) continue;
    for (const item of task.items || []) {
      if (!['approval', 'question'].includes(item.type)) continue;
      const elicitation = elicitationFor(task, item, profile);
      messages.push({ id: messagePrefix + item.id, room_id: roomId, task_id: task.id,
        role: 'local-elicitation', created_at: item.created_at || task.created_at,
        // The shipped room compares message text with params.message to select
        // its content/fallback presentation. A contentless user bubble has no
        // intrinsic width and is not the original elicitation wire contract.
        content: { text: elicitation.params.message, elicitation }, local_approval_id: item.id,
      });
    }
  }
  return messages;
}

function findRequest(state, roomId, messageId) {
  if (!messageId.startsWith(messagePrefix)) throw fail('Local input request not found', 404);
  const id = messageId.slice(messagePrefix.length);
  for (const task of state.tasks.filter(task => task.room_id === roomId)) {
    const item = task.items?.find(item => item.id === id && ['approval', 'question'].includes(item.type));
    const profile = state.profiles.find(profile => profile.id === task.profile_id);
    if (item && profile) return { task, item, profile };
  }
  throw fail('Local input request not found', 404);
}

const fingerprint = item => 'local-approval-v1:' + item.id + ':' + item.created_at;

export function inspectApproval(state, roomId, messageId) {
  const { task, item, profile } = findRequest(state, roomId, messageId);
  const status = requestStatus(task, item);
  return { elicitation: elicitationFor(task, item, profile),
    request_fingerprint: fingerprint(item), runtime_status: status, can_respond: status === 'pending' };
}

export async function respondApproval({ state, roomId, messageId, body, api, refresh, signal }) {
  // Always refresh before checking status/fingerprint; a second tab or a task
  // interruption must not authorize a stale request.
  await refresh();
  const current = state();
  const { task, item } = findRequest(current, roomId, messageId);
  if (requestStatus(task, item) !== 'pending') throw fail('This local input request is no longer pending');
  if (body.request_fingerprint !== fingerprint(item)) throw fail('The local input request changed');
  const action = body.result?.action;
  if (!['accept', 'decline', 'cancel'].includes(action)) throw fail('Invalid local approval decision', 400);
  const value = body.result?.content?.answer;
  if (action === 'accept' && item.type === 'question' && (typeof value !== 'string' || !value.trim() || value.length > 10000)) throw fail('질문에 대한 답변을 입력하세요.', 400);
  await api('/api/approvals/' + encodeURIComponent(item.id) + '/respond', { method: 'POST', signal,
    body: { decision: action === 'accept' ? 'allow' : 'deny', ...(item.type === 'question' ? { value: action === 'accept' ? value : '' } : {}) } });
  await refresh();
  return { status: 'applied' };
}
