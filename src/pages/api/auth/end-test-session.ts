import type { APIRoute } from 'astro';

export const POST: APIRoute = async (context) => {
  if (!import.meta.env.DEV) {
    return new Response(null, { status: 404 });
  }

  context.cookies.delete('commonwork_local_test_session', { path: '/' });
  return context.redirect('/sign-in', 303);
};