import { getEventCatalogueSelections } from './event-catalogue';
import { getLisbonEventContextBySlug } from './events/lisbon-context';

export function eventCataloguePath(
  eventSlug: string,
  options: { productSlug?: string; all?: boolean } = {},
): string | null {
  const context = getLisbonEventContextBySlug(eventSlug);
  if (!context) return null;
  if (options.productSlug && !getEventCatalogueSelections(context.eventId).some((item) => item.productSlug === options.productSlug)) return null;
  const query = new URLSearchParams({ from_event: context.eventSlug });
  if (options.productSlug) query.set('product', options.productSlug);
  if (options.all) query.set('view', 'all');
  return `/catalogue?${query}`;
}
