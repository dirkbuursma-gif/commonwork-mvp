import { expect, test } from '@playwright/test';
import {
  getCatalogueJourneyContext,
  getEventCatalogueSelection,
  getEventCatalogueSelections,
} from '../src/lib/event-catalogue';

const eventId = '00000000-0000-4000-8000-00000000e001';
const eventSlug = 'commonwork-lisbon-preview';
const productSlugs = ['geoffy', 'admultify', 'rierino-commerce-platform', 'be-cited'];

test('Lisbon selection contains exactly the four scoped offerings in order', () => {
  const selections = getEventCatalogueSelections(eventId);
  expect(selections.map((selection) => selection.productSlug)).toEqual(productSlugs);
  expect(new Set(selections.map((selection) => selection.productSlug)).size).toBe(4);
  for (const selection of selections) {
    expect(selection.eventId).toBe(eventId);
    expect(selection.eventSlug).toBe(eventSlug);
    expect(selection.relevance.length).toBeGreaterThan(40);
  }
});

test('legacy single-selection callers retain the original Be.cited product identity', () => {
  expect(getEventCatalogueSelection(eventId)?.productSlug).toBe('be-cited');
});

test('each selected offering preserves its own product and Lisbon context', () => {
  for (const productSlug of productSlugs) {
    const context = getCatalogueJourneyContext(eventSlug, productSlug);
    expect(context?.productSlug).toBe(productSlug);
    expect(context?.eventId).toBe(eventId);
    expect(context?.eventSlug).toBe(eventSlug);
    expect(context?.competencySlug).toBe('agentic-commerce');
  }
});

test('unrelated events cannot acquire the scoped Lisbon selection', () => {
  expect(getEventCatalogueSelections(undefined)).toEqual([]);
  expect(getEventCatalogueSelections('unrelated-event')).toEqual([]);
  expect(getEventCatalogueSelection('unrelated-event')).toBeNull();
  for (const productSlug of productSlugs) {
    expect(getCatalogueJourneyContext('unrelated-event', productSlug)).toBeNull();
    expect(getCatalogueJourneyContext(null, productSlug)).toBeNull();
  }
});

test('unselected and missing products do not acquire Lisbon journey context', () => {
  expect(getCatalogueJourneyContext(eventSlug, 'adobe-commerce')).toBeNull();
  expect(getCatalogueJourneyContext(eventSlug, 'rierino')).toBeNull();
  expect(getCatalogueJourneyContext(eventSlug, 'benext-ai')).toBeNull();
  expect(getCatalogueJourneyContext(eventSlug, undefined)).toBeNull();
});
