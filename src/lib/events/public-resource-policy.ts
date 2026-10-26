import { getLisbonEventContextBySlug } from './lisbon-context';

/** Server-only opt-in. An event being published is not a public-resource grant. */
export function publicEventResourcesEnabled(slug: string, raw: string | undefined = process.env.COMMONWORK_PUBLIC_EVENT_RESOURCE_IDS): boolean {
  const event = getLisbonEventContextBySlug(slug);
  if (!event || !raw || raw.length > 4096) return false;
  const ids = raw.split(',').map((id) => id.trim());
  if (ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))) return false;
  return ids.includes(event.eventId);
}
