export function catalogueRedirect(requestUrl: string, method: string): string | null {
  if (!['GET', 'HEAD'].includes(method)) return null;
  const source = new URL(requestUrl);
  const path = source.pathname.replace(/\/$/, '');
  const product = /^\/intelligence\/product\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  const category = /^\/intelligence\/category\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
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
