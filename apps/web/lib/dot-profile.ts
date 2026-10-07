export const DOT_COLORS = [
  { id: 'silver', label: '라벤더', value: '#bdc1d2' },
  { id: 'blue', label: '하늘', value: '#19b6de' },
  { id: 'yellow', label: '노랑', value: '#ffcf35' },
  { id: 'pink', label: '분홍', value: '#d875d7' },
  { id: 'lime', label: '라임', value: '#b7d91a' },
  { id: 'rose', label: '장미', value: '#f2a5bb' },
] as const;
export const DOT_CHARACTERS = [
  { id: 'iggy', name: 'Iggy', description: '핑크 · 헤드폰', color: 'pink', x: 0, y: 0 },
  { id: 'felipe', name: 'Felipe', description: '파랑 · 베레모', color: 'blue', x: 512, y: 0 },
  { id: 'todd', name: 'Todd', description: '초록 · 큰 눈과 나비넥타이', color: 'lime', x: 1024, y: 0 },
  { id: 'alfred', name: 'Alfred', description: '노랑 · 둥근 안경과 나비넥타이', color: 'yellow', x: 0, y: 512 },
  { id: 'jojo', name: 'Jojo', description: '하트 · 검은 안경', color: 'pink', x: 512, y: 512 },
] as const;
export type DotAvatarId = 'ring' | 'pet' | typeof DOT_CHARACTERS[number]['id'];
export type DotProfile = { name: string; color: typeof DOT_COLORS[number]['id']; avatar: DotAvatarId; theme: 'dark' | 'light'; setupStep: number; setupCompleted: boolean };
export const PROFILE_KEY = 'ohmydots-profile-v1';
export const DEFAULT_PROFILE: DotProfile = { name: 'OhMyDots', color: 'silver', avatar: 'ring', theme: 'dark', setupStep: 0, setupCompleted: false };
export function parseDotProfile(raw: string | null): DotProfile {
  try {
    const value = JSON.parse(raw || '{}');
    return { name: typeof value?.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 32) : DEFAULT_PROFILE.name,
      color: DOT_COLORS.some(c => c.id === value?.color) ? value.color : 'silver',
      avatar: value?.avatar === 'pet' || DOT_CHARACTERS.some(character => character.id === value?.avatar) ? value.avatar : 'ring', theme: value?.theme === 'light' ? 'light' : 'dark',
      setupStep: Number.isInteger(value?.setupStep) && value.setupStep >= 0 && value.setupStep <= 2 ? value.setupStep : 0,
      setupCompleted: value?.setupCompleted === true };
  } catch { return { ...DEFAULT_PROFILE }; }
}
