import type { SupabaseClient } from '@supabase/supabase-js';

export const FOLLOWING_PAGE_SIZE = 20;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FollowSurface = 'catalogue' | 'product' | 'following';
export type FollowStatus = 'followed' | 'unfollowed' | 'unavailable' | 'failed';

export interface ProductFollowState { product_id: string; following: boolean }
export interface FollowedProduct {
  product_id: string;
  available: boolean;
  product_slug: string | null;
  product_name: string | null;
  provider_name: string | null;
}
export interface ParsedFollowForm {
  productId: string;
  follow: boolean;
  surface: FollowSurface;
  slug: string | null;
  page: number;
  event: string | null;
}

export const followStatusMessages: Record<FollowStatus, string> = {
  followed: 'You are now following this product. Following is private interest only.',
  unfollowed: 'You no longer follow this product.',
  unavailable: 'This product is not available to follow.',
  failed: 'We could not update your following list. Please try again.',
};

export function isFollowStatus(value: string | null): value is FollowStatus {
  return value !== null && value in followStatusMessages;
}

export async function getProductFollowState(client: SupabaseClient, slug: string): Promise<ProductFollowState | null> {
  if (!slugPattern.test(slug)) return null;
  const { data, error } = await client.rpc('get_product_follow_state', { target_slug: slug });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as ProductFollowState | undefined;
  return row ? { product_id: row.product_id, following: row.following === true } : null;
}

export async function getMyFollowedProductCount(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('get_my_followed_product_count');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function listMyFollowedProducts(client: SupabaseClient, page: number): Promise<FollowedProduct[]> {
  const { data, error } = await client.rpc('list_my_followed_products', {
    page_limit: FOLLOWING_PAGE_SIZE,
    page_offset: (Math.max(1, page) - 1) * FOLLOWING_PAGE_SIZE,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as FollowedProduct[];
}

/** Applies the requested state through the database RPC, which enforces membership and publication. */
export async function setProductFollow(client: SupabaseClient, productId: string, follow: boolean): Promise<FollowStatus> {
  const { error } = await client.rpc(follow ? 'follow_product' : 'unfollow_product', { target_product_id: productId });
  if (!error) return follow ? 'followed' : 'unfollowed';
  return error.code === '22023' ? 'unavailable' : 'failed';
}

export function parseFollowForm(form: FormData): ParsedFollowForm | null {
  const text = (key: string) => String(form.get(key) ?? '').trim();
  const productId = text('product_id');
  const intent = text('intent');
  const surface = text('surface');
  const slug = text('slug');
  const event = text('from_event');
  const page = Number(text('page') || '1');
  if (!uuidPattern.test(productId) || !['follow', 'unfollow'].includes(intent)) return null;
  if (!['catalogue', 'product', 'following'].includes(surface)) return null;
  if (surface !== 'following' && !slugPattern.test(slug)) return null;
  if (event && !slugPattern.test(event)) return null;
  return {
    productId,
    follow: intent === 'follow',
    surface: surface as FollowSurface,
    slug: slug || null,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    event: event || null,
  };
}

/** Builds the return location from validated parts only; request input is never echoed as a path. */
export function followRedirect(parsed: ParsedFollowForm, status: FollowStatus): string {
  const target = new URL('https://commonwork.invalid');
  if (parsed.surface === 'catalogue') {
    target.pathname = '/catalogue';
    target.searchParams.set('product', parsed.slug!);
    if (parsed.event) target.searchParams.set('from_event', parsed.event);
  } else if (parsed.surface === 'product') {
    target.pathname = `/intelligence/product/${parsed.slug}`;
    target.searchParams.set('workspace', '1');
    if (parsed.event) target.searchParams.set('from_event', parsed.event);
  } else {
    target.pathname = '/following';
    if (parsed.page > 1) target.searchParams.set('page', String(parsed.page));
  }
  target.searchParams.set('follow', status);
  return `${target.pathname}${target.search}#follow-status`;
}
