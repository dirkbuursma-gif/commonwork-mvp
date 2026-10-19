/** Server-only diagnostics. Return fixed labels, never values or decoded claims. */
export type DeliveryConfigurationDiagnostic =
  | 'SERVER_ONLY'
  | 'PUBLIC_URL_MISSING'
  | 'PUBLIC_URL_INVALID'
  | 'PUBLIC_URL_REJECTED'
  | 'PRIVATE_KEY_MISSING'
  | 'PRIVATE_KEY_LINE_BREAK'
  | 'PRIVATE_KEY_FORMAT'
  | 'PRIVATE_KEY_ROLE'
  | 'PRIVATE_KEY_EXPIRED'
  | 'PRIVATE_KEY_PROJECT'
  | 'CONFIG_CHECK_FAILED';

/** Explains an already-failed check; this is NEVER an authorization or acceptance decision. */
export function describeDeliveryConfigurationFailure(input: {
  publicUrl: unknown;
  privateKey: unknown;
  development: boolean;
  server: boolean;
}): DeliveryConfigurationDiagnostic {
  if (!input.server) return 'SERVER_ONLY';
  if (typeof input.publicUrl !== 'string' || !input.publicUrl) return 'PUBLIC_URL_MISSING';
  let url: URL;
  try { url = new URL(input.publicUrl); } catch { return 'PUBLIC_URL_INVALID'; }
  const local = input.development && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if ((!local && (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname))) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) return 'PUBLIC_URL_REJECTED';
  const key = input.privateKey;
  if (typeof key !== 'string' || !key) return 'PRIVATE_KEY_MISSING';
  if (/[\r\n]/.test(key)) return 'PRIVATE_KEY_LINE_BREAK';
  if (!key.startsWith('sb_secret_')) {
    let claims: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'PRIVATE_KEY_FORMAT';
      claims = parsed as Record<string, unknown>;
    } catch { return 'PRIVATE_KEY_FORMAT'; }
    if (claims.role !== 'service_role') return 'PRIVATE_KEY_ROLE';
    if (claims.exp && Number(claims.exp) * 1000 <= Date.now()) return 'PRIVATE_KEY_EXPIRED';
    if (!local && claims.ref !== url.hostname.split('.')[0]) return 'PRIVATE_KEY_PROJECT';
  }
  return 'CONFIG_CHECK_FAILED';
}
