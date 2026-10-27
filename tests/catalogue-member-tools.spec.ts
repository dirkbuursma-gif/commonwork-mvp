import { expect, test } from '@playwright/test';
import { catalogueRedirect, memberProductPath, memberCategoryPath } from '../src/lib/catalogue-redirect';
import { validateReturnPath } from '../src/lib/auth-return-path';
const origin = 'https://commonwork.network';
test('member product tools preserve the product and event context', () => {
  const path = memberProductPath(`${origin}/catalogue?product=geoffy&from_event=agentic-commerce-lisbon-2026`);
  expect(path).toBe('/intelligence/product/geoffy?workspace=1&from_event=agentic-commerce-lisbon-2026');
  expect(catalogueRedirect(`${origin}${path}`, 'GET')).toBeNull();
  expect(validateReturnPath(path)).toBe(path);
});
test('explicit product and category workspace requests retain protected handlers', () => {
  expect(catalogueRedirect(`${origin}/intelligence/product/geoffy?workspace=1`, 'HEAD')).toBeNull();
  expect(catalogueRedirect(`${origin}/intelligence/product/geoffy?workspace=0`, 'GET')).toBe('/catalogue?product=geoffy');
  expect(catalogueRedirect(`${origin}/intelligence?workspace=1`, 'GET')).toBe('/catalogue');
  expect(catalogueRedirect(`${origin}/intelligence/category/example?workspace=1`, 'GET')).toBeNull();
});
test('category expertise preserves event context and a safe sign-in return path', () => {
  const path = memberCategoryPath(`${origin}/catalogue?category=product-data-enrichment&from_event=agentic-commerce-lisbon-2026`);
  expect(path).toBe('/intelligence/category/product-data-enrichment?workspace=1&from_event=agentic-commerce-lisbon-2026');
  expect(catalogueRedirect(`${origin}${path}`, 'GET')).toBeNull();
  expect(validateReturnPath(path)).toBe(path);
});
test('product tool links cannot escape the local route or appear for unrelated pages', () => {
  for (const url of [`${origin}/catalogue`, `${origin}/competence?product=geoffy`, `${origin}/catalogue?product=//example.org`, `${origin}/catalogue?product=geoffy%2Fextra`]) {
    expect(memberProductPath(url)).toBeNull();
  }
  expect(memberProductPath(`${origin}/catalogue?role=admultify`)).toBe('/intelligence/product/admultify?workspace=1');
  expect(memberProductPath(`${origin}/catalogue?product=geoffy&from_event=//example.org`)).toBe('/intelligence/product/geoffy?workspace=1');
  expect(memberCategoryPath(`${origin}/catalogue?category=//example.org`)).toBeNull();
  expect(memberCategoryPath(`${origin}/competence?category=example`)).toBeNull();
});
test('member-tool return paths reject extra keys, duplicates, unsafe events and noncanonical encodings', () => {
  for (const suffix of ['workspace=0', 'workspace=1&workspace=1', 'workspace=1&next=https://example.org', 'workspace=1&from_event=//example.org', 'workspace=1&from_event=one&from_event=two', 'workspace=1#fragment', 'work%73pace=1']) {
    expect(validateReturnPath(`/intelligence/category/example?${suffix}`)).toBeNull();
  }
  expect(validateReturnPath('/intelligence/provider/example?workspace=1')).toBeNull();
  expect(validateReturnPath('/intelligence/category/example?workspace=1')).toBe('/intelligence/category/example?workspace=1');
});
