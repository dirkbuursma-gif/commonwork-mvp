import type { APIRoute } from 'astro';

const cookieName = 'commonwork_local_test_session';

export const POST: APIRoute = async (context) => {
  if (!import.meta.env.DEV) {
    return new Response(null, { status: 404 });
  }

  context.cookies.set(cookieName, 'enabled', {
    httpOnly: true,
    maxAge: 60 * 60 * 8,
    path: '/',
    sameSite: 'lax',
    secure: new URL(context.request.url).protocol === 'https:',
  });

  return context.redirect('/today', 303);
};