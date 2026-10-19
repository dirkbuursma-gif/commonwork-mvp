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
  if (slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    return new Response('A valid event reference is required.', { status: 400 });
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return new Response('Event access is not configured.', { status: 503 });
  const event = await supabase.from('events').select('id')
    .eq('id', eventId).eq('slug', slug).eq('is_published', true).maybeSingle();
  if (event.error) return new Response('Event requests are temporarily unavailable.', { status: 503 });
  if (!event.data) return new Response('Event unavailable for requests.', { status: 404 });

  // Only the authenticated caller is targeted; submitted identity/decision fields
  // are ignored. The database creates a private profile and request atomically.
  const result = await supabase.rpc('request_event_attendance', { target_event_id: eventId });
  const status = !result.error && (result.data === 'requested' || result.data === 'already-requested')
    ? result.data : 'request-failed';
  return back(context, slug, status);
};
