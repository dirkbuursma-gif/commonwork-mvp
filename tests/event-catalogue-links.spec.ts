import { expect, test } from '@playwright/test';
import { eventCataloguePath } from '../src/lib/event-catalogue-links';
import { getEventCatalogueSelections } from '../src/lib/event-catalogue';
import { getLisbonEventContextBySlug } from '../src/lib/events/lisbon-context';

for (const slug of ['commonwork-lisbon-preview', 'agentic-commerce-lisbon-2026']) {
  test(`${slug} preserves all four offerings and event context`, () => {
    const context = getLisbonEventContextBySlug(slug)!;
    const selections = getEventCatalogueSelections(context.eventId);
    expect(selections).toHaveLength(4);
    for (const selection of selections) {
      const path = eventCataloguePath(slug, { productSlug: selection.productSlug });
      expect(path).not.toBeNull();
      const url = new URL(path!, 'https://commonwork.network');
      expect(url.pathname).toBe('/catalogue');
      expect(url.searchParams.get('from_event')).toBe(slug);
      expect(url.searchParams.get('product')).toBe(selection.productSlug);
    }
    expect(eventCataloguePath(slug)).toBe(`/catalogue?from_event=${slug}`);
    expect(eventCataloguePath(slug, { all: true })).toBe(`/catalogue?from_event=${slug}&view=all`);
  });
}
test('unrelated events and unselected products do not acquire an event collection link', () => {
  expect(eventCataloguePath('unrelated-event')).toBeNull();
  expect(eventCataloguePath('agentic-commerce-lisbon-2026', { productSlug: 'unrelated-product' })).toBeNull();
  expect(eventCataloguePath('//example.org')).toBeNull();
});
