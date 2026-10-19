import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeEmail } from './email-code-auth';

export const EVENT_PENDING_COOKIE = 'cw_event_signup_pending';
export const EVENT_PENDING_SECONDS = 900;
export type EventSignupConfig = { secret: string; siteKey: string; eventIds: Set<string> };
export type EventSignupScope = { id: string; slug: string; is_published: boolean };
export type EventPending = { email: string; eventId: string; slug: string; sentAt: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function eventSignupConfig(env: Record<string, string | undefined> = process.env): EventSignupConfig | null {
  if (env.VERCEL_ENV === 'production' || env.COMMONWORK_EVENT_SIGNUP_ENABLED !== 'true') return null;
  const secret = env.COMMONWORK_EVENT_SIGNUP_SIGNING_SECRET ?? '';
  const siteKey = env.COMMONWORK_EVENT_SIGNUP_TURNSTILE_SITE_KEY?.trim() ?? '';
  const ids = (env.COMMONWORK_EVENT_SIGNUP_EVENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (Buffer.byteLength(secret, 'utf8') < 32 || !siteKey || !ids.length || ids.some((id) => !uuid.test(id))) return null;
  return { secret, siteKey, eventIds: new Set(ids) };
}

export function eventSignupAllowed(config: EventSignupConfig | null, event: EventSignupScope): boolean {
  return Boolean(config && event.is_published === true && config.eventIds.has(event.id)
    && event.slug.length <= 80 && slug.test(event.slug) && event.slug !== 'manage');
}

export function encodeEventPending(pending: EventPending, secret: string): string {
  const body = Buffer.from(JSON.stringify({ v: 1, ...pending })).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function decodeEventPending(raw: unknown, secret: string, eventId: string, eventSlug: string, now = Date.now()): EventPending | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  const parts = raw.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]{43}$/.test(parts[1]!)) return null;
  const [body, signature] = parts as [string, string];
  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const email = normalizeEmail(p.email);
    if (p.v !== 1 || !email || p.eventId !== eventId || p.slug !== eventSlug ||
        typeof p.sentAt !== 'number' || !Number.isFinite(p.sentAt) ||
        p.sentAt > now || now - p.sentAt >= EVENT_PENDING_SECONDS * 1000) return null;
    return { email, eventId, slug: eventSlug, sentAt: p.sentAt };
  } catch { return null; }
}

type ErrorLike = { status?: number; code?: string } | null;
type EventCodeClient = { auth: { signInWithOtp(input: { email: string; options: { shouldCreateUser: true; captchaToken: string } }): PromiseLike<{ error: ErrorLike }> } };
export async function requestEventEmailCode(client: EventCodeClient, config: EventSignupConfig | null, event: EventSignupScope, email: unknown, captcha: unknown): Promise<'disabled' | 'invalid' | 'sent' | 'rate_limited' | 'unavailable'> {
  if (!eventSignupAllowed(config, event)) return 'disabled';
  const address = normalizeEmail(email);
  if (!address || typeof captcha !== 'string' || !captcha.trim() || captcha.length > 4096) return 'invalid';
  try {
    const { error } = await client.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true, captchaToken: captcha.trim() } });
    if (!error) return 'sent';
    if (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') return 'rate_limited';
    if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) return 'sent';
    return 'unavailable';
  } catch { return 'unavailable'; }
}
