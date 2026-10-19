import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { getEventMaterialAccess } from '../../../lib/events/material-access';
import { getLisbonEventContextBySlug } from '../../../lib/events/lisbon-context';
import { deliveryError, readDeliveryConfiguration, streamEventObject } from '../../../lib/events/object-delivery';

const clips: Record<string, string> = {
  geoffy: 'Geoffy-in-60-seconds-EN-1080p.mp4',
  begen: 'AdMultify by Begen Video Teaser.mp4',
  rierino: 'Rierino_Agentic_Commerce_InRetail_2026_music.mp4',
};

function diagnostic(stage: string, details: Record<string, string | number | boolean> = {}): void {
  try { console.info('[event-video-delivery]', JSON.stringify({ stage, ...details })); } catch { /* Diagnostics must not affect delivery. */ }
}

export const prerender = false;
export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) return deliveryError('Approved event attendee access is required.', user ? 403 : 401);
  const eventContext = getLisbonEventContextBySlug(context.url.searchParams.get('event_slug'));
  const clip = context.url.searchParams.get('clip') ?? '';
  if (!eventContext || !Object.prototype.hasOwnProperty.call(clips, clip)) return deliveryError('Event video not found.', 404);
  const supabase = createSupabaseServerClient(context);
  if (!supabase) {
    diagnostic('app-client-unconfigured');
    return deliveryError('Event video is not configured.', 503);
  }
  try {
    const { data: identity, error } = await supabase.auth.getUser();
    if (error || !identity.user?.email_confirmed_at || identity.user.id !== user.id) return deliveryError('Verified authentication is required.', 401);
    const access = await getEventMaterialAccess(supabase, eventContext.eventSlug, identity.user.id);
    if (access.status !== 'available') return deliveryError('This video is not available for your account.', access.status === 'not-found' ? 404 : 403);
    if (access.event.id !== eventContext.eventId || access.event.slug !== eventContext.eventSlug) return deliveryError('Event video not found.', 404);
    diagnostic('authorized');
    const configuration = () => {
      try {
        const config = readDeliveryConfiguration();
        diagnostic('configuration-accepted');
        return config;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const reason = message === 'Private delivery credential required.' ? 'private-credential-invalid'
          : message === 'Invalid delivery configuration.' ? 'storage-origin-invalid'
          : message === 'Server configuration required.' ? 'server-context-required' : 'configuration-error';
        diagnostic('configuration-rejected', { reason });
        throw error;
      }
    };
    const fetcher: typeof fetch = async (input, init) => {
      const method = init?.method === 'HEAD' ? 'HEAD' : 'GET';
      try {
        const response = await fetch(input, init);
        diagnostic('storage-response', {
          method, status: response.status, hasBody: response.body !== null,
          rangeRequested: new Headers(init?.headers).has('range'),
          encoded: response.headers.has('content-encoding') && response.headers.get('content-encoding') !== 'identity',
        });
        return response;
      } catch (error) {
        diagnostic('storage-fetch-failed', { method });
        throw error;
      }
    };
    const response = await streamEventObject({ request: context.request, eventId: eventContext.eventId, path: `${eventContext.eventId}/videos/${clips[clip]}`, video: true }, { configuration, fetcher });
    diagnostic('delivery-complete', { status: response.status });
    return response;
  } catch {
    diagnostic('route-exception');
    return deliveryError('We could not load this video. Please try again shortly.', 503);
  }
};
