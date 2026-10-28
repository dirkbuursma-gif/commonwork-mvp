import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { followRedirect, parseFollowForm, setProductFollow } from '../../lib/product-follows';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) return new Response('Authentication required.', { status: 401, headers: { 'Cache-Control': 'private, no-store' } });

  const origin = context.request.headers.get('origin');
  if (origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin form submission rejected.', { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const parsed = parseFollowForm(await context.request.formData());
  if (!parsed) return new Response('A valid product follow request is required.', { status: 400, headers: { 'Cache-Control': 'private, no-store' } });

  const client = createSupabaseServerClient(context);
  if (!client) return new Response('Product following is not configured.', { status: 503, headers: { 'Cache-Control': 'private, no-store' } });

  // Membership, ownership and publication are enforced by the database function.
  const status = await setProductFollow(client, parsed.productId, parsed.follow);
  return context.redirect(followRedirect(parsed, status), 303);
};

// Following changes state only through POST.
export const GET: APIRoute = () =>
  new Response('Method not allowed.', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'private, no-store' } });
