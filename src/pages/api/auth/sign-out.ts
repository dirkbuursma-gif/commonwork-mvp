import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect('/sign-in', 303);
  if (context.locals.user.isLocalTestUser) return context.redirect('/sign-in', 303);

  const origin = context.request.headers.get('origin');
  if (origin && origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin sign-out rejected.', { status: 403 });
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect('/sign-in?status=configuration', 303);

  const { error } = await supabase.auth.signOut();
  return context.redirect(error ? '/sign-in?status=unavailable' : '/sign-in?status=signed-out', 303);
};