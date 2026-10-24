/**
 * Dot lifecycle copy and geometry.
 *
 * The Korean labels, dialog bodies and confirmations mirror the installed ChatGPT
 * desktop build (20770) references recorded in
 * docs/research/chatgpt-ui-static-2026-10-18.md: the dot context menu
 * ("이름 변경 / 오른쪽 창으로 이동 / 일시 중지 / 재부팅 / 삭제"), the rename dialog
 * ("짧고 알아보기 쉽게"), the reboot dialog ("닷이 멈춘 것 같을 때") and the delete
 * dialog ("대화는 보관, 기억과 컴퓨터는 삭제"). Copy that has no local behaviour
 * behind it is written as an honest unavailable state rather than an imitation.
 */
export type DotStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export type DotMenuAction = 'rename' | 'move' | 'pause' | 'resume' | 'reboot' | 'delete' | 'pin';

export const DOT_MENU_LABELS: Record<DotMenuAction, string> = {
  rename: '이름 변경',
  move: '오른쪽 창으로 이동',
  pause: '일시 중지',
  resume: '재개',
  reboot: '재부팅',
  delete: '삭제',
  pin: '목록 위에 고정',
};

export function dotMenu(dot: { status: DotStatus; pinned: boolean }): DotMenuAction[] {
  return ['rename', 'move', dot.status === 'PAUSED' ? 'resume' : 'pause', 'reboot', 'pin', 'delete'];
}

export const RENAME_DIALOG = {
  title: (name: string) => name + ' 이름 바꾸기',
  subtitle: '짧고 알아보기 쉽게 지어 주세요',
  placeholder: '이름 추가…',
  confirm: '저장',
  cancel: '취소',
  rejected: '이 이름은 사용할 수 없습니다. 다른 이름을 선택해 주세요.',
};

export const PAUSE_DIALOG = {
  title: (name: string) => name + ' 닷을 일시 중지할까요?',
  body: '진행 중인 작업이 취소되고, 재개할 때까지 이 닷에게 새 작업을 맡길 수 없습니다.',
  confirm: '일시 중지',
  cancel: '취소',
  requested: '일시 중지했습니다',
};

export const RESUME_DIALOG = {
  title: (name: string) => name + ' 닷을 재개할까요?',
  body: '다시 작업을 맡길 수 있습니다.',
  confirm: '재개',
  cancel: '취소',
  requested: '재개했습니다',
};

export const REBOOT_DIALOG = {
  title: (name: string) => name + ' 닷을 재부팅할까요?',
  body: '닷이 멈춘 것 같을 때 재부팅하면 도움이 됩니다. 진행 중인 작업이 중단될 수 있지만 대화와 파일은 그대로 유지됩니다.',
  confirm: '다시 시작',
  cancel: '취소',
  requested: '재부팅을 요청했습니다',
};

export const DELETE_DIALOG = {
  title: (name: string) => '“' + name + '” 닷을 삭제할까요?',
  body: '이 닷과의 대화는 보관되고, 이 닷의 기억과 컴퓨터가 삭제됩니다. 이 닷이 만든 다른 채팅은 삭제되지 않습니다.',
  confirm: '삭제',
  cancel: '취소',
  requested: '삭제했습니다',
};

export const CALL_UNAVAILABLE = '음성 통화는 아직 지원하지 않습니다. 메시지로 이어서 요청해 주세요.';

export const PIP_CONTROLS = {
  restore: '원래 창으로 되돌리기',
  hide: '숨기기',
  hideForChat: '이 채팅에서 숨기기',
  hideForAll: '모든 채팅에서 숨기기',
  sendToDot: 'Dot 정보 패널로 보내기',
};

export function canRename(value: string): boolean {
  const name = value.trim();
  return name.length >= 1 && name.length <= 32 && !/[\r\n]/.test(value);
}

export function relativeTime(value: number | null | undefined, now = Date.now()): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '활동 기록 없음';
  const elapsed = Math.max(0, now / 1000 - value);
  if (elapsed < 60) return '방금 전';
  if (elapsed < 3600) return Math.floor(elapsed / 60) + '분 전';
  if (elapsed < 86400) return Math.floor(elapsed / 3600) + '시간 전';
  if (elapsed < 604800) return Math.floor(elapsed / 86400) + '일 전';
  const date = new Date(value * 1000);
  return date.getFullYear() + '. ' + (date.getMonth() + 1) + '. ' + date.getDate() + '.';
}

export function dotStatusLabel(status: DotStatus, live: { running: boolean; waiting: boolean }): string {
  if (status === 'PAUSED') return '일시 중지됨';
  if (status === 'ARCHIVED') return '보관됨';
  if (live.waiting) return '답변을 기다리는 중';
  if (live.running) return '작업 중';
  return '대기 중';
}

export const DOT_STATUS_LABELS: Record<DotStatus, string> = { ACTIVE: '활성', PAUSED: '일시 중지됨', ARCHIVED: '보관됨' };

export type PipRect = { x: number; y: number; width: number; height: number };
export const PIP_MIN_WIDTH = 280;
export const PIP_MIN_HEIGHT = 180;
export const PIP_DEFAULT_WIDTH = 420;
export const PIP_DEFAULT_HEIGHT = 280;

export function defaultPipRect(bounds: { width: number; height: number }): PipRect {
  const width = Math.max(PIP_MIN_WIDTH, Math.min(PIP_DEFAULT_WIDTH, bounds.width - 32));
  const height = Math.max(PIP_MIN_HEIGHT, Math.min(PIP_DEFAULT_HEIGHT, bounds.height - 32));
  return { x: Math.max(8, bounds.width - width - 24), y: Math.max(8, bounds.height - height - 24), width, height };
}

/** Keep the floating computer inside the window so it can never be dragged away. */
export function clampPip(rect: PipRect, bounds: { width: number; height: number }): PipRect {
  const width = Math.max(PIP_MIN_WIDTH, Math.min(rect.width, Math.max(PIP_MIN_WIDTH, bounds.width - 16)));
  const height = Math.max(PIP_MIN_HEIGHT, Math.min(rect.height, Math.max(PIP_MIN_HEIGHT, bounds.height - 16)));
  return {
    width,
    height,
    x: Math.min(Math.max(8, rect.x), Math.max(8, bounds.width - width - 8)),
    y: Math.min(Math.max(8, rect.y), Math.max(8, bounds.height - height - 8)),
  };
}

export function parsePipRect(raw: string | null, bounds: { width: number; height: number }): PipRect {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object') return defaultPipRect(bounds);
    const numbers = ['x', 'y', 'width', 'height'].map(key => value[key]);
    if (numbers.some(number => typeof number !== 'number' || !Number.isFinite(number))) {
      return defaultPipRect(bounds);
    }
    return clampPip({ x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3] }, bounds);
  } catch { return defaultPipRect(bounds); }
}
