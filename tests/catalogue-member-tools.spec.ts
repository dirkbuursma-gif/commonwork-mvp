import { expect, test } from '@playwright/test';
import { catalogueRedirect, memberProductPath } from '../src/lib/catalogue-redirect';
const origin = 'https://commonwork.network';
test('member product tools preserve the product and event context', () => {
  const path = memberProductPath(`${origin}/catalogue?product=geoffy&from_event=agentic-commerce-lisbon-2026`);
  expect(path).toBe('/intelligence/product/geoffy?workspace=1&from_event=agentic-commerce-lisbon-2026');
  expect(catalogueRedirect(`${origin}${path}`, 'GET')).toBeNull();
});
test('only an explicit product workspace request avoids the discovery redirect', () => {
  expect(catalogueRedirect(`${origin}/intelligence/product/geoffy?workspace=1`, 'HEAD')).toBeNull();
  expect(catalogueRedirect(`${origin}/intelligence/product/geoffy?workspace=0`, 'GET')).toBe('/catalogue?product=geoffy');
  expect(catalogueRedirect(`${origin}/intelligence?workspace=1`, 'GET')).toBe('/catalogue');
  expect(catalogueRedirect(`${origin}/intelligence/category/example?workspace=1`, 'GET')).toBe('/catalogue?category=example&view=all');
});
test('product tool links cannot escape the local route or appear for unrelated pages', () => {
  for (const url of [`${origin}/catalogue`, `${origin}/competence?product=geoffy`, `${origin}/catalogue?product=//example.org`, `${origin}/catalogue?product=geoffy%2Fextra`]) {
    expect(memberProductPath(url)).toBeNull();
  }
  expect(memberProductPath(`${origin}/catalogue?role=admultify`)).toBe('/intelligence/product/admultify?workspace=1');
  expect(memberProductPath(`${origin}/catalogue?product=geoffy&from_event=//example.org`)).toBe('/intelligence/product/geoffy?workspace=1');
});
