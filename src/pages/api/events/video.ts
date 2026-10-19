import type { APIRoute } from 'astro';
import { getLisbonEventContextBySlug } from '../../../lib/events/lisbon-context';
import { deliveryError, deliveryHeaders, readDeliveryConfiguration, type DeliveryConfiguration } from '../../../lib/events/object-delivery';

const clips: Record<string, string> = {
  geoffy: 'Geoffy-in-60-seconds-EN-1080p.mp4',
  begen: 'AdMultify by Begen Video Teaser.mp4',
  rierino: 'Rierino_Agentic_Commerce_InRetail_2026_music.mp4',
};

// Only these explicitly public clips may bypass attendee authorization.
// Protected documents continue to use their own authorization and streaming route.
export async function publicVideoResponse(url: URL, dependencies: {
  configuration?: () => DeliveryConfiguration; fetcher?: typeof fetch;
} = {}): Promise<Response> {
  const eventContext = getLisbonEventContextBySlug(url.searchParams.get('event_slug'));
  const clip = url.searchParams.get('clip') ?? '';
  if (!eventContext || !Object.prototype.hasOwnProperty.call(clips, clip)) {
    return deliveryError('Event video not found.', 404);
  }
  try {
    const { origin, key } = (dependencies.configuration ?? readDeliveryConfiguration)();
    const path = `${eventContext.eventId}/videos/${clips[clip]}`.split('/').map(encodeURIComponent).join('/');
    const signedPath = `/object/sign/event-materials/${path}`;
    const headers = new Headers({ apikey: key, 'Content-Type': 'application/json' });
    if (!key.startsWith('sb_secret_')) headers.set('Authorization', `Bearer ${key}`);
    const upstream = await (dependencies.fetcher ?? fetch)(new URL(`/storage/v1${signedPath}`, origin), {
      method: 'POST', headers, body: JSON.stringify({ expiresIn: 300 }),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) {
      try { await upstream.body?.cancel(); } catch { /* Never disclose upstream errors. */ }
      return deliveryError('Video signing unavailable. Check the server-only delivery configuration.', 503);
    }
    const data = await upstream.json() as { signedURL?: unknown };
    if (typeof data.signedURL !== 'string') throw new Error('Invalid signing response.');
    const raw = data.signedURL;
    const target = new URL(raw.startsWith('/object/sign/') ? `/storage/v1${raw}` : raw, origin);
    const expected = new URL(`/storage/v1${signedPath}`, origin);
    if (target.origin !== origin || target.username || target.password || target.hash ||
        decodeURIComponent(target.pathname) !== decodeURIComponent(expected.pathname) || !target.searchParams.get('token')) {
      throw new Error('Invalid signing response.');
    }
    return new Response(null, { status: 307, headers: { ...deliveryHeaders, Location: target.href } });
  } catch {
    return deliveryError('Video signing unavailable. Check the server-only delivery configuration.', 503);
  }
}

export const prerender = false;
export const GET: APIRoute = async (context) => publicVideoResponse(context.url);
