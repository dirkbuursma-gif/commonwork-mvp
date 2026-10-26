export function catalogueRedirect(requestUrl: string, method: string): string | null {
  if (!['GET', 'HEAD'].includes(method)) return null;
  const source = new URL(requestUrl);
  const path = source.pathname.replace(/\/$/, '');
  const product = /^\/intelligence\/product\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  const category = /^\/intelligence\/category\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  // Keep the existing product handler behind the normal authentication and workspace checks.
  if (product && source.searchParams.get('workspace') === '1') return null;
  if (path !== '/intelligence' && !product && !category) return null;
  const target = new URL('/catalogue', source.origin);
  const keys = product || category ? ['from_event', 'view'] : ['from_event', 'view', 'q', 'category', 'competence', 'page'];
  for (const key of keys) {
    const value = source.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  if (product) target.searchParams.set('product', product[1]!);
  if (category) {
    target.searchParams.set('category', category[1]!);
    target.searchParams.set('view', 'all');
  }
  return `${target.pathname}${target.search}`;
}

export function memberProductPath(requestUrl: string): string | null {
  const source = new URL(requestUrl);
  if (source.pathname !== '/catalogue') return null;
  const product = source.searchParams.get('product') || source.searchParams.get('role') || '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product)) return null;
  const target = new URL(`/intelligence/product/${product}`, source.origin);
  target.searchParams.set('workspace', '1');
  const event = source.searchParams.get('from_event');
  if (event && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event)) target.searchParams.set('from_event', event);
  return `${target.pathname}${target.search}`;
}
