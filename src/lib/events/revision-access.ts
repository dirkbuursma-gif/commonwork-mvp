import type { APIContext } from 'astro';
import { createSupabaseServerClient } from '../supabase/server';
import { getEventMaterialAccess } from './material-access';
import { matchesLisbonEventContext } from './lisbon-context';
type Context = Pick<APIContext, 'locals' | 'cookies' | 'request' | 'params'>;
type Page = { eventHome: string; title: string; videoSources: Record<string, string> };
export async function requireRevisionAccess(context: Context): Promise<Response | Page> {
  const denied = (text: string, status: number) => new Response(text, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) return denied('Approved event attendee access is required.', user ? 403 : 401);
  const client = createSupabaseServerClient(context);
  if (!client) return denied('Event materials are not configured.', 503);
  const access = await getEventMaterialAccess(client, context.params.slug ?? '', user.id);
  if (access.status !== 'available') return denied(access.status === 'not-found' ? 'Event not found.' : 'Approved event attendee access is required.', access.status === 'not-found' ? 404 : 403);
  const clip = (key: string) => '/api/events/video?' + new URLSearchParams({ event_slug: access.event.slug, clip: key }).toString();
  const videoSources: Record<string, string> = matchesLisbonEventContext(access.event.id, access.event.slug) ? { geoffy: clip('geoffy'), begen: clip('begen'), rierino: clip('rierino') } : {};
  return { eventHome: `/events/${access.event.slug}`, title: access.event.title, videoSources };
}
