import type { APIContext } from 'astro';
import { matchesLisbonEventContext } from './lisbon-context';
import { eventCodeAccessEnabled, resolveEventResourceAccess } from './event-code-server';
type Context = Pick<APIContext, 'locals' | 'cookies' | 'request' | 'params'>;
type Page = { eventHome: string; title: string; videoSources: Record<string, string> };
export async function requireRevisionAccess(context: Context): Promise<Response | Page> {
  const denied = (text: string, status: number) => new Response(text, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  const slug = context.params.slug ?? '';
  const access = await resolveEventResourceAccess(context, slug);
  if (access.status !== 'available') {
    if (eventCodeAccessEnabled() && ['unauthorized', 'forbidden'].includes(access.status) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug !== 'manage') {
      return new Response(null, { status: 303, headers: { Location: `/events/${slug}/access`, 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
    }
    return denied('Event materials are not available.', access.status === 'not-found' ? 404 : access.status === 'unavailable' ? 503 : access.status === 'unauthorized' ? 401 : 403);
  }
  const clip = (key: string) => '/api/events/video?' + new URLSearchParams({ event_slug: access.event.slug, clip: key }).toString();
  const videoSources: Record<string, string> = matchesLisbonEventContext(access.event.id, access.event.slug) ? { geoffy: clip('geoffy'), begen: clip('begen'), rierino: clip('rierino') } : {};
  return { eventHome: eventCodeAccessEnabled() ? `/events/${access.event.slug}/access` : `/events/${access.event.slug}`, title: access.event.title, videoSources };
}
