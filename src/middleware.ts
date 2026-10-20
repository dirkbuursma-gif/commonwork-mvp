import { defineMiddleware } from 'astro:middleware';
import { getCurrentUser } from './lib/auth';
import { validateReturnPath } from './lib/auth-return-path';
import { createSupabaseServerClient } from './lib/supabase/server';
import { isEventResourceRequest, isOwnAccountRequest, readWorkspaceAccess } from './lib/workspace-access';
import { deliveryHeaders } from './lib/events/object-delivery';
import { eventCodeAccessEnabled, eventCodePageRoute } from './lib/events/event-code-server';

const publicPaths = new Set([
  '/sign-in', '/sign-in/code', '/auth/callback', '/api/auth/sign-in',
  '/api/auth/resend-code', '/api/auth/change-email', '/api/auth/verify-code',
  '/api/auth/test-session', '/api/auth/end-test-session',
  '/api/internal/notifications/dispatch', '/api/webhooks/resend',
]);
const localTestUser: App.User = {
  id: '00000000-0000-4000-8000-000000000001', email: 'test.member@commonwork.local',
  user_metadata: { full_name: 'Local Test Member' }, isLocalTestUser: true,
};
const publicEditorialPath = /^\/(?:insights(?:\/[^/]+)?|about|events\/[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const eventJoinPath = /^\/events\/(?!manage\/)[a-z0-9]+(?:-[a-z0-9]+)*\/join$/;
function hasSupabaseAuthCookie(request: Request): boolean {
  return (request.headers.get('cookie') ?? '').split(';').some((cookie) => /^sb-.+-auth-token(?:\.\d+)?=/i.test(cookie.trim()));
}
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = new URL(context.request.url);
  if (publicPaths.has(pathname) || pathname.startsWith('/_astro/') || pathname.startsWith('/favicon')) return next();
  const local = import.meta.env.DEV && context.cookies.get('commonwork_local_test_session')?.value === 'enabled';
  const codePage = eventCodeAccessEnabled() ? eventCodePageRoute(pathname, context.request.method) : null;
  const codeDownload = eventCodeAccessEnabled() && pathname === '/api/events/code-material' && context.request.method === 'POST';
  // Exemptions only let handlers run; every protected handler still authorizes the event.
  if (codePage || codeDownload) {
    const user = local ? localTestUser : hasSupabaseAuthCookie(context.request) ? await getCurrentUser(context) : null;
    if (user) context.locals.user = user;
    if (codePage?.section === 'home') {
      return new Response(null, { status: 303, headers: { ...deliveryHeaders, Location: `/events/${codePage.slug}/access` } });
    }
    const response = await next();
    for (const [name, value] of Object.entries(deliveryHeaders)) response.headers.set(name, value);
    // HTML forms need a non-null Origin; downloads retain no-referrer.
    if (codePage) response.headers.set('Referrer-Policy', 'same-origin');
    return response;
  }
  if (pathname === '/api/events/material' || pathname === '/api/events/video') {
    const deliveryUser = local ? localTestUser : hasSupabaseAuthCookie(context.request) ? await getCurrentUser(context) : null;
    if (deliveryUser) context.locals.user = deliveryUser;
    const response = await next();
    for (const [name, value] of Object.entries(deliveryHeaders)) response.headers.set(name, value);
    return response;
  }
  const join = eventJoinPath.test(pathname) && ['GET', 'HEAD', 'POST'].includes(context.request.method);
  const editorial = (context.request.method === 'GET' || context.request.method === 'HEAD')
    && pathname !== '/events/manage' && pathname !== '/insights/editor' && publicEditorialPath.test(pathname);
  if (editorial || join) {
    const user = local ? localTestUser : hasSupabaseAuthCookie(context.request) ? await getCurrentUser(context) : null;
    if (user) context.locals.user = user;
    const response = await next();
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  const user = local ? localTestUser : await getCurrentUser(context);
  if (!user) {
    const returnPath = validateReturnPath(`${pathname}${new URL(context.request.url).search}`);
    const target = new URL('/sign-in', context.request.url);
    if (returnPath) target.searchParams.set('return_to', returnPath);
    return context.redirect(`${target.pathname}${target.search}`, 303);
  }
  context.locals.user = user;
  const ownAccount = isOwnAccountRequest(pathname, context.request.method);
  if (!local && !ownAccount && !isEventResourceRequest(pathname, context.request.method)) {
    const client = createSupabaseServerClient(context);
    if (!client || !await readWorkspaceAccess(client)) {
      return new Response('Workspace membership is required. Event requests and approved event resources remain available.', {
        status: 403, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }
  const response = await next();
  if (ownAccount) { response.headers.set('Cache-Control', 'private, no-store'); response.headers.append('Vary', 'Cookie'); }
  return response;
});
