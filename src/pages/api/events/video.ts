import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { getEventMaterialAccess } from '../../../lib/events/material-access';
import { getLisbonEventContextBySlug } from '../../../lib/events/lisbon-context';
import { deliveryError, streamEventObject } from '../../../lib/events/object-delivery';

const clips: Record<string, string> = {
  geoffy: 'Geoffy-in-60-seconds-EN-1080p.mp4',
  begen: 'AdMultify by Begen Video Teaser.mp4',
  rierino: 'Rierino_Agentic_Commerce_InRetail_2026_music.mp4',
};
export const prerender = false;
export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) return deliveryError('Approved event attendee access is required.', user ? 403 : 401);
  const eventContext = getLisbonEventContextBySlug(context.url.searchParams.get('event_slug'));
  const clip = context.url.searchParams.get('clip') ?? '';
  if (!eventContext || !Object.prototype.hasOwnProperty.call(clips, clip)) return deliveryError('Event video not found.', 404);
  const supabase = createSupabaseServerClient(context);
  if (!supabase) return deliveryError('Event video is not configured.', 503);
  try {
    const { data: identity, error } = await supabase.auth.getUser();
    if (error || !identity.user?.email_confirmed_at || identity.user.id !== user.id) return deliveryError('Verified authentication is required.', 401);
    const access = await getEventMaterialAccess(supabase, eventContext.eventSlug, identity.user.id);
    if (access.status !== 'available') return deliveryError('This video is not available for your account.', access.status === 'not-found' ? 404 : 403);
    if (access.event.id !== eventContext.eventId || access.event.slug !== eventContext.eventSlug) return deliveryError('Event video not found.', 404);
    return streamEventObject({ request: context.request, eventId: eventContext.eventId, path: `${eventContext.eventId}/videos/${clips[clip]}`, video: true });
  } catch { return deliveryError('We could not load this video. Please try again shortly.', 503); }
};
