import { expect, test } from '@playwright/test';
import { catalogueRedirect } from '../src/lib/catalogue-redirect';
const origin = 'https://commonwork.network';
test('landing redirects retain useful discovery filters', () => {
  expect(catalogueRedirect(`${origin}/intelligence?competence=data-governance&q=product`, 'GET')).toBe('/catalogue?q=product&competence=data-governance');
  expect(catalogueRedirect(`${origin}/intelligence/`, 'HEAD')).toBe('/catalogue');
});
test('event product links retain their event and override conflicting product parameters', () => {
  const result = catalogueRedirect(`${origin}/intelligence/product/geoffy?from_event=agentic-commerce-lisbon-2026&product=other&q=other`, 'GET');
  expect(result).toBe('/catalogue?from_event=agentic-commerce-lisbon-2026&product=geoffy');
});
test('category links browse the full category while retaining event context', () => {
  expect(catalogueRedirect(`${origin}/intelligence/category/commerce-platforms?from_event=agentic-commerce-lisbon-2026`, 'GET')).toBe('/catalogue?from_event=agentic-commerce-lisbon-2026&category=commerce-platforms&view=all');
});
test('redirects do not exempt private routes, APIs, malformed slugs or write requests', () => {
  for (const path of ['/intelligence/provider/example', '/api/intelligence/affiliation', '/profiles/example', '/competence', '/intelligence/product/example/extra', '/intelligence/product/example%2Fextra']) {
    expect(catalogueRedirect(`${origin}${path}`, 'GET')).toBeNull();
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    expect(catalogueRedirect(`${origin}/intelligence/product/geoffy`, method)).toBeNull();
  }
});
test('arbitrary query parameters cannot turn a legacy link into an external redirect', () => {
  expect(catalogueRedirect(`${origin}/intelligence?return_to=https://example.org&redirect=//example.org`, 'GET')).toBe('/catalogue');
});
