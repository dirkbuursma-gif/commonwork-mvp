import type { SupabaseClient } from '@supabase/supabase-js';

export const MEMBER_AVATARS = [
  { id: 'initials', label: 'Initials', glyph: '' },
  { id: 'compass', label: 'Compass', glyph: '✦' },
  { id: 'leaf', label: 'Leaf', glyph: '◈' },
  { id: 'orbit', label: 'Orbit', glyph: '◎' },
  { id: 'wave', label: 'Wave', glyph: '∿' },
  { id: 'spark', label: 'Spark', glyph: '✧' },
  { id: 'grid', label: 'Grid', glyph: '▦' },
  { id: 'sun', label: 'Sun', glyph: '◉' },
] as const;

export type MemberAvatarId = (typeof MEMBER_AVATARS)[number]['id'];

export interface MemberIdentity {
  profile_id: string;
  display_name: string;
  username: string | null;
  avatar_id: MemberAvatarId;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  const normalized = normalizeUsername(value);
  return normalized.length >= 3
    && normalized.length <= 30
    && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(normalized);
}

export function getMemberInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toLocaleUpperCase() ?? '').join('') || 'M';
}

export async function getMyIdentity(client: SupabaseClient): Promise<MemberIdentity | null> {
  const { data, error } = await client.rpc('get_my_identity');
  if (error) throw error;
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return (rows[0] as MemberIdentity | undefined) ?? null;
}

export async function saveMyIdentity(
  client: SupabaseClient,
  input: { displayName: string; avatarId: MemberAvatarId; username?: string | null },
): Promise<MemberIdentity | null> {
  const { data, error } = await client.rpc('save_my_identity', {
    target_display_name: input.displayName,
    target_avatar_id: input.avatarId,
    target_username: input.username ? normalizeUsername(input.username) : null,
  });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return (rows[0] as MemberIdentity | undefined) ?? null;
}