import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { getEventMaterialAccess } from '../../../lib/events/material-access';

const eventSlug = 'commonwork-lisbon-preview';
const eventId = '00000000-0000-4000-8000-00000000e001';
const clips: Record<string, string> = {
  geoffy: 'Geoffy-in-60-seconds-EN-1080p.mp4',
  begen: 'AdMultify by Begen Video Teaser.mp4',
};

function unavailable(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) {
    return unavailable('Approved event attendee access is required.', user ? 403 : 401);
  }
  const requestedEvent = context.url.searchParams.get('event_slug');
  const clip = context.url.searchParams.get('clip') ?? '';
  if (requestedEvent !== eventSlug) return unavailable('Event video not found.', 404);
  if (!Object.prototype.hasOwnProperty.call(clips, clip)) return unavailable('Event video not found.', 404);

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return unavailable('Event video is not configured.', 503);

  try {
    const access = await getEventMaterialAccess(supabase, eventSlug, user.id);
    if (access.status !== 'available') {
      return unavailable('This video is not available for your account.', access.status === 'not-found' ? 404 : 403);
    }
    if (access.event.id !== eventId) return unavailable('Event video not found.', 404);

    const path = `${eventId}/videos/${clips[clip]}`;
    const { data, error } = await supabase.storage.from('event-materials').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return unavailable('This video is not available. Please reload and try again.', 404);

    return new Response(null, {
      status: 307,
      headers: {
        Location: data.signedUrl,
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    return unavailable('We could not load this video. Please try again shortly.', 503);
  }
};
