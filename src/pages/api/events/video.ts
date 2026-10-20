import type { APIRoute } from 'astro';
import { resolveEventResourceAccess } from '../../../lib/events/event-code-server';
import { getLisbonEventContextBySlug } from '../../../lib/events/lisbon-context';
import { deliveryError, streamEventObject } from '../../../lib/events/object-delivery';
import { readVideoDeliveryConfiguration as readDeliveryConfiguration } from '../../../lib/events/video-delivery-configuration';

const clips: Record<string, string> = {
  geoffy: 'Geoffy-in-60-seconds-EN-1080p.mp4',
  begen: 'AdMultify by Begen Video Teaser.mp4',
  rierino: 'Rierino_Agentic_Commerce_InRetail_2026_music.mp4',
};
function diagnostic(stage: string, details: Record<string, string | number | boolean> = {}): void {
  try { console.info('[event-video-delivery]', JSON.stringify({ stage, ...details })); } catch { /* Diagnostics must not affect delivery. */ }
}
function credentialDiagnostics(): Record<string, string | number | boolean> {
  const raw = process.env.COMMONWORK_VIDEO_SECRET_KEY;
  const key = raw ?? '';
  const details = { credentialVariable: 'COMMONWORK_VIDEO_SECRET_KEY', present: raw !== undefined, empty: key.length === 0, secretPrefix: key.startsWith('sb_secret_'), hasNewline: /[\r\n]/.test(key) };
  let failure = 'none';
  if (!details.secretPrefix) {
    try {
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      const url = new URL(import.meta.env.PUBLIC_SUPABASE_URL);
      const local = import.meta.env.DEV && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
      if (!claims || claims.role !== 'service_role') failure = 'legacy-role-invalid';
      else if (claims.exp && claims.exp * 1000 <= Date.now()) failure = 'legacy-expired';
      else if (!local && claims.ref !== url.hostname.split('.')[0]) failure = 'legacy-project-mismatch';
    } catch { failure = 'legacy-unreadable'; }
  }
  if (details.empty) failure = details.present ? 'empty' : 'missing';
  else if (failure === 'none' && details.hasNewline) failure = 'newline';
  return { ...details, failure };
}
export const prerender = false;
export const GET: APIRoute = async (context) => {
  const eventContext = getLisbonEventContextBySlug(context.url.searchParams.get('event_slug'));
  const clip = context.url.searchParams.get('clip') ?? '';
  if (!eventContext || !Object.prototype.hasOwnProperty.call(clips, clip)) return deliveryError('Event video not found.', 404);
  try {
    const access = await resolveEventResourceAccess(context, eventContext.eventSlug);
    if (access.status !== 'available') return deliveryError('Event access is required.', access.status === 'not-found' ? 404 : access.status === 'unavailable' ? 503 : access.status === 'unauthorized' ? 401 : 403);
    if (access.event.id !== eventContext.eventId || access.event.slug !== eventContext.eventSlug) return deliveryError('Event video not found.', 404);
    diagnostic('authorized');
    const configuration = () => {
      try {
        const config = readDeliveryConfiguration();
        diagnostic('configuration-accepted', { credentialVariable: 'COMMONWORK_VIDEO_SECRET_KEY' });
        return config;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const reason = message === 'Private delivery credential required.' ? 'private-credential-invalid'
          : message === 'Invalid delivery configuration.' ? 'storage-origin-invalid'
          : message === 'Server configuration required.' ? 'server-context-required' : 'configuration-error';
        diagnostic('configuration-rejected', { reason, credentialVariable: 'COMMONWORK_VIDEO_SECRET_KEY' });
        if (reason === 'private-credential-invalid') {
          try { diagnostic('credential-diagnostics', credentialDiagnostics()); } catch { diagnostic('credential-diagnostics-unavailable'); }
        }
        throw error;
      }
    };
    const fetcher: typeof fetch = async (input, init) => {
      const method = init?.method === 'HEAD' ? 'HEAD' : 'GET';
      try {
        const response = await fetch(input, init);
        diagnostic('storage-response', { method, status: response.status, hasBody: response.body !== null, rangeRequested: new Headers(init?.headers).has('range'), encoded: response.headers.has('content-encoding') && response.headers.get('content-encoding') !== 'identity' });
        return response;
      } catch (error) { diagnostic('storage-fetch-failed', { method }); throw error; }
    };
    const response = await streamEventObject({ request: context.request, eventId: eventContext.eventId, path: `${eventContext.eventId}/videos/${clips[clip]}`, video: true }, { configuration, fetcher });
    diagnostic('delivery-complete', { status: response.status });
    return response;
  } catch { diagnostic('route-exception'); return deliveryError('We could not load this video. Please try again shortly.', 503); }
};
