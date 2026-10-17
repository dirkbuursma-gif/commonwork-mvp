import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

function back(context: Parameters<APIRoute>[0], slug: string, status: string) {
  const target = new URL(`/events/${slug}`, context.request.url);
  target.searchParams.set('status', status);
  return context.redirect(target.pathname + target.search, 303);
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/sign-in', 303);
  if (user.isLocalTestUser) return new Response('Preview identity is read-only.', { status: 403 });

  const origin = context.request.headers.get('origin');
  if (origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin form submission rejected.', { status: 403 });
  }

  const form = await context.request.formData();
  const slug = String(form.get('slug') ?? '').trim();
  const eventId = String(form.get('event_id') ?? '').trim();
  if (!slug || !eventId) return new Response('An event reference is required.', { status: 400 });

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return new Response('Event access is not configured.', { status: 503 });

  // Members may only ever create a 'requested' row; approval is a manager action.
  const { error } = await supabase
    .from('event_attendees')
    .insert({ event_id: eventId, profile_id: user.id, status: 'requested' });

  if (error) {
    return back(context, slug, error.code === '23505' ? 'already-requested' : 'request-failed');
  }

  return back(context, slug, 'requested');
};
