import { defineMiddleware } from 'astro:middleware';
import { getCurrentUser } from './lib/auth';
import { validateReturnPath } from './lib/auth-return-path';

const publicPaths = new Set([
  '/sign-in',
  '/sign-in/code',
  '/auth/callback',
  '/api/auth/sign-in',
  '/api/auth/resend-code',
  '/api/auth/change-email',
  '/api/auth/verify-code',
  '/api/auth/test-session',
  '/api/auth/end-test-session',
  '/api/internal/notifications/dispatch',
  '/api/webhooks/resend',
]);

const localTestUser: App.User = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'test.member@commonwork.local',
  user_metadata: { full_name: 'Local Test Member' },
  isLocalTestUser: true,
};

const publicEditorialPath = /^\/(?:insights(?:\/[^/]+)?|about|events\/[a-z0-9]+(?:-[a-z0-9]+)*)$/;

function hasSupabaseAuthCookie(request: Request): boolean {
  return (request.headers.get('cookie') ?? '')
    .split(';')
    .some((cookie) => /^sb-.+-auth-token(?:\.\d+)?=/i.test(cookie.trim()));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = new URL(context.request.url);
  const isAsset = pathname.startsWith('/_astro/') || pathname.startsWith('/favicon');

  if (publicPaths.has(pathname) || isAsset) {
    return next();
  }

  if (
    (context.request.method === 'GET' || context.request.method === 'HEAD') &&
    publicEditorialPath.test(pathname)
  ) {
    const hasLocalTestSession =
      import.meta.env.DEV &&
      context.cookies.get('commonwork_local_test_session')?.value === 'enabled';
    const user = hasLocalTestSession
      ? localTestUser
      : hasSupabaseAuthCookie(context.request)
        ? await getCurrentUser(context)
        : null;
    if (user) context.locals.user = user;
    const response = await next();
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  const hasLocalTestSession =
    import.meta.env.DEV &&
    context.cookies.get('commonwork_local_test_session')?.value === 'enabled';
  const user = hasLocalTestSession ? localTestUser : await getCurrentUser(context);
  if (!user) {
    const returnPath = validateReturnPath(`${pathname}${new URL(context.request.url).search}`);
    const signInUrl = new URL('/sign-in', context.request.url);
    if (returnPath) signInUrl.searchParams.set('return_to', returnPath);
    return context.redirect(`${signInUrl.pathname}${signInUrl.search}`, 303);
  }

  context.locals.user = user;
  return next();
});
