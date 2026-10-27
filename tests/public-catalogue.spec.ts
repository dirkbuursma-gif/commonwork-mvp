import { expect, test } from '@playwright/test';
import { filterPublicCatalogue, type PublicCatalogueEntry } from '../src/lib/public-catalogue';
const entry: PublicCatalogueEntry = {
  slug: 'example-product', name: 'Example product', provider_name: 'Example provider',
  summary: 'Product information workflows', capabilities: 'Localisation',
  evidence_maturity: 'Claimed', boundaries: '', questions: [], disclosure: '',
  categories: [{ slug: 'product-information', name: 'Product information' }],
  competencies: [{ slug: 'data-governance', name: 'Data governance', description: 'Govern product data.' }],
};
test('search includes provider, capability and related competence vocabulary', () => {
  for (const q of ['EXAMPLE PROVIDER', 'Localisation', 'data governance']) {
    expect(filterPublicCatalogue([entry], { q })).toEqual([entry]);
  }
});
test('event collections remain scoped and compose with other filters', () => {
  expect(filterPublicCatalogue([entry], { eventProducts: [] })).toEqual([]);
  expect(filterPublicCatalogue([entry], { eventProducts: [entry.slug], category: 'product-information', competence: 'data-governance' })).toEqual([entry]);
  expect(filterPublicCatalogue([entry], { eventProducts: [entry.slug], competence: 'unrelated' })).toEqual([]);
});
test('unrelated product links do not silently display other offerings', () => {
  expect(filterPublicCatalogue([entry], { product: 'missing-product' })).toEqual([]);
});
