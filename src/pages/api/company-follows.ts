import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { parseProviderFollowForm, providerFollowRedirect, setProviderFollow } from '../../lib/company-follows';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) return new Response('Authentication required.', { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
  if (context.request.headers.get('origin') !== new URL(context.request.url).origin) {
    return new Response('Cross-origin form submission rejected.', { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const parsed = parseProviderFollowForm(await context.request.formData());
  if (!parsed) return new Response('A valid company follow request is required.', { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
  const client = createSupabaseServerClient(context);
  if (!client) return new Response('Company following is not configured.', { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  try {
    const following = await setProviderFollow(client, parsed.providerId, parsed.follow);
    return context.redirect(providerFollowRedirect(context.request.url, parsed, following ? 'followed' : 'unfollowed'), 303);
  } catch {
    return context.redirect(providerFollowRedirect(context.request.url, parsed, parsed.follow ? 'unavailable' : 'failed'), 303);
  }
};

export const GET: APIRoute = () => new Response('Method not allowed.', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'private, no-store' } });