import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

function redirect(context: Parameters<APIRoute>[0], slug: string, status: string) {
  const target = new URL(`/events/${slug}/manage`, context.request.url);
  target.searchParams.set('status', status);
  return context.redirect(target.pathname + target.search, 303);
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) return new Response('Authentication required.', { status: 401 });

  const origin = context.request.headers.get('origin');
  if (origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin form submission rejected.', { status: 403 });
  }

  const form = await context.request.formData();
  const action = String(form.get('action') ?? '');
  const slug = String(form.get('slug') ?? '');

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return new Response('Event management is not configured.', { status: 503 });

  if (action === 'create-event') {
    const title = String(form.get('title') ?? '').trim();
    const summary = String(form.get('summary') ?? '').trim();
    const location = String(form.get('location') ?? '').trim();
    if (!title || !slug) return new Response('A title and URL name are required.', { status: 400 });

    const { error } = await supabase.from('events').insert({
      slug,
      title,
      summary,
      location,
      manager_profile_id: user.id,
      is_published: false,
    });

    if (error) return context.redirect('/events/manage?status=create-failed', 303);
    return context.redirect(`/events/${slug}/manage?status=created`, 303);
  }

  const eventId = String(form.get('event_id') ?? '');
  if (!eventId || !slug) return new Response('An event reference is required.', { status: 400 });

  if (action === 'update-event') {
    const title = String(form.get('title') ?? '').trim();
    const summary = String(form.get('summary') ?? '').trim();
    const location = String(form.get('location') ?? '').trim();
    const isPublished = form.get('is_published') === 'on';
    if (!title) return redirect(context, slug, 'invalid-event');

    const { error } = await supabase
      .from('events')
      .update({ title, summary, location, is_published: isPublished, updated_at: new Date().toISOString() })
      .eq('id', eventId);
    return redirect(context, slug, error ? 'update-failed' : 'event-updated');
  }

  if (action === 'decide-attendee') {
    const profileId = String(form.get('profile_id') ?? '');
    const decision = String(form.get('decision') ?? '');
    if (!profileId || !['approved', 'revoked'].includes(decision)) {
      return redirect(context, slug, 'invalid-attendee');
    }

    const { error } = await supabase
      .from('event_attendees')
      .update({
        status: decision,
        decided_at: new Date().toISOString(),
        decided_by: user.id,
      })
      .eq('event_id', eventId)
      .eq('profile_id', profileId);
    return redirect(context, slug, error ? 'decision-failed' : 'attendee-updated');
  }

  if (action === 'add-material') {
    const title = String(form.get('title') ?? '').trim();
    const kind = String(form.get('kind') ?? '');
    const storagePath = String(form.get('storage_path') ?? '').trim();
    if (!title || !['presentation', 'guide', 'replay'].includes(kind)) {
      return redirect(context, slug, 'invalid-material');
    }
    if (!storagePath.startsWith(`${eventId}/`)) {
      return redirect(context, slug, 'invalid-material-path');
    }

    const { error } = await supabase.from('event_materials').insert({
      event_id: eventId,
      title,
      kind,
      storage_path: storagePath,
    });
    return redirect(context, slug, error ? 'material-failed' : 'material-added');
  }

  return new Response('Unsupported event-management action.', { status: 400 });
};
