/** Server-only event pass adapter. Never import into browser code. */
import type { APIContext } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { createSupabaseServerClient } from '../supabase/server';
import { getEventMaterialAccess, type EventMaterialAccess } from './material-access';
import type { EventSummary, EventMaterial } from '../events';
import { readVideoDeliveryConfiguration } from './video-delivery-configuration';
import { eventPassCookieName, issueEventPass, verifyEventAccessCode, verifyEventPass, type EventPassBinding } from './event-pass';

type PassContext = Pick<APIContext, 'cookies' | 'request'>;
type ResourceContext = PassContext & Pick<APIContext, 'locals'>;
export function eventCodeAccessEnabled(): boolean { return process.env.COMMONWORK_EVENT_CODE_ACCESS_ENABLED === 'true'; }
export function eventCodePageRoute(path: string, method: string): { slug: string; section: string } | null {
  const match = /^\/events\/(?!manage(?:\/|$))([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/(access|presentation|guide(?:\/print)?))?\/?$/.exec(path);
  if (!match || (!['GET', 'HEAD'].includes(method) && !(method === 'POST' && match[2] === 'access'))) return null;
  return { slug: match[1]!, section: match[2] ?? 'home' };
}
function passSecret(): string {
  const secret = process.env.COMMONWORK_EVENT_PASS_SIGNING_SECRET ?? '';
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('Event access unavailable.');
  return secret;
}
function serverClient() {
  const { origin, key } = readVideoDeliveryConfiguration();
  return createClient(origin, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => {
    const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (new URL(address).origin !== origin) throw new Error('Event access unavailable.');
    return fetch(input, { ...init, redirect: 'error', cache: 'no-store' });
  } } });
}
export async function loadEventCodeState(slug: string) {
  if (!eventCodeAccessEnabled() || slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug === 'manage') return null;
  passSecret();
  const client = serverClient();
  const eventResult = await client.from('events').select('id, slug, title, summary, location, starts_at, ends_at, is_published, manager_profile_id').eq('slug', slug).eq('is_published', true).maybeSingle();
  if (eventResult.error) throw new Error('Event access unavailable.');
  if (!eventResult.data) return null;
  const event = eventResult.data as EventSummary;
  const codeResult = await client.from('event_access_codes').select('event_id, code_salt, code_hash, version, enabled, expires_at').eq('event_id', event.id).maybeSingle();
  if (codeResult.error) throw new Error('Event access unavailable.');
  if (!codeResult.data) return null;
  const code = codeResult.data;
  const binding: EventPassBinding = { eventId: event.id, version: code.version, enabled: code.enabled, expiresAt: code.expires_at === null ? null : Date.parse(code.expires_at) };
  return { client, event, code, binding };
}
export type EventCodeState = NonNullable<Awaited<ReturnType<typeof loadEventCodeState>>>;
export function hasEventPass(context: PassContext, state: EventCodeState): boolean {
  return verifyEventPass(context.cookies.get(eventPassCookieName(state.event.id))?.value, state.binding, passSecret());
}
export async function listPassMaterials(state: EventCodeState): Promise<EventMaterial[]> {
  const result = await state.client.from('event_materials').select('id, event_id, kind, title, storage_path').eq('event_id', state.event.id);
  if (result.error) throw new Error('Event access unavailable.');
  return (result.data ?? []) as EventMaterial[];
}
export async function readEventCodeAccess(context: PassContext, slug: string): Promise<{ event: EventSummary; materials: EventMaterial[] } | null> {
  if (!eventCodeAccessEnabled() || !(context.request.headers.get('cookie') ?? '').includes('cw_event_pass_')) return null;
  const state = await loadEventCodeState(slug);
  if (!state || !hasEventPass(context, state)) return null;
  return { event: state.event, materials: await listPassMaterials(state) };
}
export async function resolveEventResourceAccess(context: ResourceContext, slug: string): Promise<EventMaterialAccess | { status: 'unauthorized' | 'unavailable' }> {
  try {
    const pass = await readEventCodeAccess(context, slug);
    if (pass) return { status: 'available', ...pass };
    const user = context.locals.user;
    if (!user) return { status: 'unauthorized' };
    if (user.isLocalTestUser) return { status: 'forbidden' };
    const client = createSupabaseServerClient(context);
    if (!client) return { status: 'unavailable' };
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user?.email_confirmed_at || identity.data.user.id !== user.id) return { status: 'unauthorized' };
    return await getEventMaterialAccess(client, slug, user.id);
  } catch { return { status: 'unavailable' }; }
}
export async function readEventAccessForm(request: Request): Promise<URLSearchParams> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) throw new Error('Invalid event form.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Invalid event form.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error('Invalid event form.'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export async function redeemEventCode(context: PassContext & Pick<APIContext, 'clientAddress'>, state: EventCodeState, code: unknown): Promise<'granted' | 'invalid' | 'limited'> {
  if (!eventCodeAccessEnabled() || !state.binding.enabled || (state.binding.expiresAt !== null && !(state.binding.expiresAt > Date.now()))) return 'invalid';
  const address = context.clientAddress;
  if (!address || address.length > 200) throw new Error('Event access unavailable.');
  const secret = passSecret();
  const buckets = [
    { label: 'event-global', limit: 100, seconds: 10 },
    { label: `client:${address}`, limit: 60, seconds: 60 },
  ];
  for (const bucket of buckets) {
    const hash = createHmac('sha256', secret).update(JSON.stringify(['event-code-attempt', state.event.id, bucket.label])).digest('hex');
    const result = await state.client.rpc('consume_event_access_attempt', { target_event_id: state.event.id, target_bucket_hash: hash, target_limit: bucket.limit, target_window_seconds: bucket.seconds });
    if (result.error) throw new Error('Event access unavailable.');
    if (result.data !== true) return 'limited';
  }
  if (!verifyEventAccessCode(code, state.code.code_salt, state.code.code_hash)) return 'invalid';
  const pass = issueEventPass(state.binding, secret);
  const remaining = state.binding.expiresAt === null ? 86400 : Math.min(86400, Math.floor((state.binding.expiresAt - Date.now()) / 1000));
  if (remaining < 1) return 'invalid';
  context.cookies.set(eventPassCookieName(state.event.id), pass, { path: '/', httpOnly: true, secure: new URL(context.request.url).protocol === 'https:', sameSite: 'lax', maxAge: remaining });
  return 'granted';
}
