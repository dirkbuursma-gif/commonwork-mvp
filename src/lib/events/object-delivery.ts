/** Server-only object delivery. Never import this module into browser code. */
export const deliveryHeaders = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Vary': 'Cookie',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
export function deliveryError(message: string, status: number): Response {
  return new Response(message, { status, headers: { ...deliveryHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
}
export type DeliveryConfiguration = { origin: string; key: string };
export function readDeliveryConfiguration(): DeliveryConfiguration {
  if (typeof window !== 'undefined') throw new Error('Server configuration required.');
  const url = new URL(import.meta.env.PUBLIC_SUPABASE_URL);
  const local = import.meta.env.DEV && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if ((!local && (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname))) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid delivery configuration.');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!key.startsWith('sb_secret_')) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); } catch { throw new Error('Private delivery credential required.'); }
    if (claims.role !== 'service_role' || (claims.exp && claims.exp * 1000 <= Date.now()) ||
        (!local && claims.ref !== url.hostname.split('.')[0])) throw new Error('Private delivery credential required.');
  }
  if (!key || /[\r\n]/.test(key)) throw new Error('Private delivery credential required.');
  return { origin: url.origin, key };
}
export function validObjectPath(eventId: string, path: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId) &&
    path.length <= 400 && path.startsWith(`${eventId}/`) && !/[\\%?#\x00-\x1f\x7f]/.test(path) &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}
function safeFilename(path: string): string {
  const name = (path.split('/').pop() ?? '').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 150).trim();
  return name && name !== '.' && name !== '..' ? name : 'event-material';
}
function parseRange(value: string | null): { start?: number; end?: number; suffix?: number } | null | false {
  if (value === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return false;
  const a = match[1] ? Number(match[1]) : undefined;
  const b = match[2] ? Number(match[2]) : undefined;
  if ([a, b].some((n) => n !== undefined && (!Number.isSafeInteger(n) || n < 0))) return false;
  if (a === undefined) return b && b > 0 ? { suffix: b } : false;
  if (b !== undefined && b < a) return false;
  return { start: a, end: b };
}
/** Call ONLY after verified caller identity and fresh database event authorization. */
export async function streamEventObject(input: {
  request: Request; eventId: string; path: string; video?: boolean;
}, dependencies: { configuration?: () => DeliveryConfiguration; fetcher?: typeof fetch } = {}): Promise<Response> {
  if (!validObjectPath(input.eventId, input.path)) return deliveryError('Invalid event object reference.', 400);
  const rangeValue = input.request.headers.get('range');
  const range = parseRange(rangeValue);
  if (range === false) return deliveryError('A single valid byte range is required.', 416);
  try {
    const { origin, key } = (dependencies.configuration ?? readDeliveryConfiguration)();
    const path = input.path.split('/').map(encodeURIComponent).join('/');
    const url = new URL(`/storage/v1/object/authenticated/event-materials/${path}`, origin);
    if (url.origin !== origin) return deliveryError('Event delivery is not configured.', 503);
    const requestHeaders = new Headers({ apikey: key });
    if (!key.startsWith('sb_secret_')) requestHeaders.set('Authorization', `Bearer ${key}`);
    if (rangeValue) requestHeaders.set('Range', rangeValue);
    const upstream = await (dependencies.fetcher ?? fetch)(url, {
      method: 'GET', headers: requestHeaders, redirect: 'error', cache: 'no-store', signal: input.request.signal,
    });
    const discard = async () => { try { await upstream.body?.cancel(); } catch { /* Never disclose upstream errors. */ } };
    if (upstream.status === 416 && range) {
      const value = upstream.headers.get('content-range');
      await discard();
      if (!value || !/^bytes \*\/\d+$/.test(value)) return deliveryError('Invalid upstream range response.', 502);
      return new Response(null, { status: 416, headers: { ...deliveryHeaders, 'Content-Range': value } });
    }
    if ((upstream.status !== 200 && upstream.status !== 206) || !upstream.body ||
        (range && upstream.status !== 206) || (!range && upstream.status !== 200) ||
        (upstream.headers.has('content-encoding') && upstream.headers.get('content-encoding') !== 'identity')) {
      await discard();
      return deliveryError('Event delivery unavailable. Check the server-only delivery configuration.', 503);
    }
    const headers = new Headers(deliveryHeaders);
    const length = upstream.headers.get('content-length');
    if (length && !/^\d+$/.test(length)) { await discard(); return deliveryError('Invalid upstream response.', 502); }
    if (upstream.status === 206) {
      const value = upstream.headers.get('content-range') ?? '';
      const parts = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value);
      const [start, end, size] = parts ? parts.slice(1).map(Number) : [NaN, NaN, NaN];
      const expectedStart = range && range.suffix ? Math.max(0, size - range.suffix) : range && range.start;
      const expectedEnd = range && range.suffix ? size - 1 : Math.min(range && range.end !== undefined ? range.end : size - 1, size - 1);
      if (![start, end, size].every(Number.isSafeInteger) || size <= 0 || start < 0 || end < start || end >= size ||
          start !== expectedStart || end !== expectedEnd || (length && Number(length) !== end - start + 1)) {
        await discard(); return deliveryError('Invalid upstream range response.', 502);
      }
      headers.set('Content-Range', value);
    }
    if (length) headers.set('Content-Length', length);
    const suppliedType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    headers.set('Content-Type', input.video ? 'video/mp4' :
      ['application/pdf', 'text/plain'].includes(suppliedType) ? suppliedType : 'application/octet-stream');
    headers.set('Content-Disposition', `${input.video ? 'inline' : 'attachment'}; filename="${safeFilename(input.path)}"`);
    headers.set('Accept-Ranges', 'bytes');
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return deliveryError('Event delivery unavailable. Check the server-only delivery configuration.', 503);
  }
}
