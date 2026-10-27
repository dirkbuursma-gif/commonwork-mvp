/** Server-only primitives. Route handlers must enforce shared rate limits before verifying codes. */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SESSION_SECONDS = 86400;
export type EventPassBinding = { eventId: string; version: string; enabled: boolean; expiresAt: number | null };

function validBinding(binding: EventPassBinding, now: number): boolean {
  return uuid.test(binding.eventId) && uuid.test(binding.version) && binding.enabled === true
    && Number.isFinite(now) && (binding.expiresAt === null || (Number.isFinite(binding.expiresAt) && binding.expiresAt > now));
}
function signingKey(secret: string): void {
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('Event pass signing is not configured.');
}
export function generateEventAccessCode(): string { return randomBytes(18).toString('base64url'); }
export function hashEventAccessCode(code: string): { salt: string; hash: string } {
  const normalized = code.trim();
  if (normalized.length < 12 || normalized.length > 256) throw new Error('Invalid event access code.');
  const salt = randomBytes(16).toString('base64url');
  return { salt, hash: scryptSync(normalized, salt, 32).toString('base64url') };
}
export function verifyEventAccessCode(code: unknown, salt: string, hash: string): boolean {
  if (typeof code !== 'string' || code.trim().length < 12 || code.length > 256
      || !/^[A-Za-z0-9_-]{22}$/.test(salt) || !/^[A-Za-z0-9_-]{43}$/.test(hash)) return false;
  try {
    const expected = Buffer.from(hash, 'base64url');
    const actual = scryptSync(code.trim(), salt, 32);
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
export function eventPassCookieName(eventId: string): string {
  if (!uuid.test(eventId)) throw new Error('Invalid event reference.');
  return `cw_event_pass_${eventId.toLowerCase().replaceAll('-', '')}`;
}
export function issueEventPass(binding: EventPassBinding, secret: string, now = Date.now(), seconds = MAX_SESSION_SECONDS): string {
  signingKey(secret);
  if (!validBinding(binding, now) || !Number.isSafeInteger(seconds) || seconds < 1 || seconds > MAX_SESSION_SECONDS) throw new Error('Event pass unavailable.');
  const expiresAt = Math.min(now + seconds * 1000, binding.expiresAt ?? Infinity);
  const body = Buffer.from(JSON.stringify({ v: 1, eventId: binding.eventId, version: binding.version, issuedAt: now, expiresAt, nonce: randomBytes(16).toString('base64url') })).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
/** The binding MUST be freshly loaded from trusted storage for each protected request. */
export function verifyEventPass(raw: unknown, binding: EventPassBinding, secret: string, now = Date.now()): boolean {
  try {
    signingKey(secret);
    if (!validBinding(binding, now) || typeof raw !== 'string' || raw.length > 2048) return false;
    const parts = raw.split('.');
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]!) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1]!)) return false;
    const [body, signature] = parts as [string, string];
    const actual = Buffer.from(signature, 'base64url');
    const expected = createHmac('sha256', secret).update(body).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p !== null && p.v === 1 && p.eventId === binding.eventId && p.version === binding.version
      && typeof p.nonce === 'string' && /^[A-Za-z0-9_-]{22}$/.test(p.nonce)
      && Number.isFinite(p.issuedAt) && Number.isFinite(p.expiresAt)
      && p.issuedAt <= now && p.expiresAt > now && p.expiresAt > p.issuedAt
      && p.expiresAt - p.issuedAt <= MAX_SESSION_SECONDS * 1000;
  } catch { return false; }
}
