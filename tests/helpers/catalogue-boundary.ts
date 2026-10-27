import { expect, type APIRequestContext } from '@playwright/test';
export const memberCategory = '/intelligence/category/commerce-platforms?workspace=1';
export const memberProduct = '/intelligence/product/adobe-commerce?workspace=1';
export async function assertPublicCatalogueAlias(request: APIRequestContext): Promise<void> {
  const response = await request.get('/intelligence', { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe('/catalogue');
  const catalogue = await request.get('/catalogue', { maxRedirects: 0 });
  expect(catalogue.status()).toBe(200);
  expect(catalogue.headers()['cache-control']).toContain('no-store');
}
