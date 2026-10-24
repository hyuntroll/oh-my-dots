'use client';
import { DOT_COLORS, type DotProfile } from '../lib/dot-profile';

type Props = { profile: Pick<DotProfile, 'name' | 'color'>; size?: number };

export function DotAvatar({ profile, size = 40 }: Props) {
  const color = DOT_COLORS.find(c => c.id === profile.color)?.value || '#b99ef8';
  const initial = profile.name?.charAt(0) || 'D';
  return (
    <span className="dot-avatar" style={{ width: size, height: size, background: color + '22', color, fontSize: size * 0.42, fontWeight: 600 }}>
      {initial}
    </span>
  );
}
