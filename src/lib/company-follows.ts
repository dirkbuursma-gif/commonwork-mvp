import type { SupabaseClient } from '@supabase/supabase-js';

export type ProviderFollowState = { provider_id: string; following: boolean };
export type FollowedProvider = { provider_id: string; available: boolean; provider_slug: string | null; provider_name: string | null };

export async function getProviderFollowState(client: SupabaseClient, slug: string): Promise<ProviderFollowState | null> {
  const { data, error } = await client.rpc('get_provider_follow_state', { target_provider_slug: slug });
  if (error) throw error;
  return ((data ?? [])[0] as ProviderFollowState | undefined) ?? null;
}

export async function setProviderFollow(client: SupabaseClient, providerId: string, follow: boolean): Promise<boolean> {
  const { data, error } = await client.rpc(follow ? 'follow_provider' : 'unfollow_provider', { target_provider_id: providerId });
  if (error) throw error;
  return data === true;
}

export async function getMyFollowedProviderCount(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('get_my_followed_provider_count');
  if (error) throw error;
  return Number(data ?? 0);
}

export const FOLLOWED_PROVIDER_PAGE_SIZE = 20;

export async function listMyFollowedProviders(client: SupabaseClient, page = 1): Promise<FollowedProvider[]> {
  const { data, error } = await client.rpc('list_my_followed_providers', {
    page_limit: FOLLOWED_PROVIDER_PAGE_SIZE,
    page_offset: (page - 1) * FOLLOWED_PROVIDER_PAGE_SIZE,
  });
  if (error) throw error;
  return (data ?? []) as FollowedProvider[];
}

export type ProviderFollowSurface = 'provider' | 'following';
export type ProviderFollowStatus = 'followed' | 'unfollowed' | 'failed' | 'unavailable';

export function parseProviderFollowForm(form: FormData) {
  const providerId = String(form.get('provider_id') ?? '');
  const intent = String(form.get('intent') ?? '');
  const slug = String(form.get('slug') ?? '');
  const surface = String(form.get('surface') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(providerId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  if (intent !== 'follow' && intent !== 'unfollow') return null;
  if (surface !== 'provider' && surface !== 'following') return null;
  return { providerId, follow: intent === 'follow', slug, surface: surface as ProviderFollowSurface };
}

export function providerFollowRedirect(
  requestUrl: string,
  parsed: { slug: string; surface: ProviderFollowSurface },
  status: ProviderFollowStatus,
) {
  const target = parsed.surface === 'following'
    ? new URL('/following', requestUrl)
    : new URL(`/intelligence/provider/${encodeURIComponent(parsed.slug)}`, requestUrl);
  target.searchParams.set('company_follow', status);
  return `${target.pathname}${target.search}`;
}

export function isProviderFollowStatus(value: string | null): value is ProviderFollowStatus {
  return value === 'followed' || value === 'unfollowed' || value === 'failed' || value === 'unavailable';
}

export const providerFollowStatusMessages: Record<ProviderFollowStatus, string> = {
  followed: 'Company added to your private following list.',
  unfollowed: 'Company removed from your private following list.',
  failed: 'We could not update your following list. Please try again.',
  unavailable: 'This company cannot currently be followed.',
};