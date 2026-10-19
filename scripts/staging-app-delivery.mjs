import { createServerClient } from '@supabase/ssr';
const REF = 'jcpwiijzycjgsfvyeeyv';
function assert(value, message) { if (!value) throw new Error(message); }
export function previewTarget(env) {
  assert(env.CI !== 'true', 'Hosted acceptance cannot run in CI.');
  const value = env.COMMONWORK_PREVIEW_URL ?? '';
  const url = new URL(value);
  const allowed = (env.COMMONWORK_PREVIEW_ALLOWLIST ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  assert(url.protocol === 'https:' && url.hostname.endsWith('.vercel.app') && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash && !url.port, 'An explicit HTTPS Vercel Preview origin is required.');
  assert(allowed.includes(url.origin), 'Preview origin must exactly match the operator allowlist.');
  assert(env.COMMONWORK_PREVIEW_CONFIRMED === 'preview-staging', 'Operator must verify this is Preview, not Production, bound to staging.');
  const bypass = env.COMMONWORK_VERCEL_PROTECTION_BYPASS ?? '';
  assert(!/[\r\n]/.test(bypass), 'Invalid Preview protection configuration.');
  return { origin: url.origin, bypass };
}
export async function fixtureCookie(publicKey, session) {
  let cookies = [];
  const client = createServerClient(`https://${REF}.supabase.co`, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    cookies: { getAll: () => cookies, setAll: (value) => { cookies = value; } },
  });
  const signed = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  assert(!signed.error && signed.data.session?.access_token === session.access_token, 'Fixture cookie session changed.');
  return cookies.filter((c) => c.value).map((c) => `${c.name}=${c.value}`).join('; ');
}
export function applicationDelivery(env) {
  const target = previewTarget(env);
  const headers = () => target.bypass ? { 'x-vercel-protection-bypass': target.bypass } : {};
  async function call(path, init = {}) {
    const url = new URL(path, target.origin);
    assert(url.origin === target.origin, 'Preview request escaped the allowlisted origin.');
    return fetch(url, { ...init, headers: { ...headers(), ...init.headers }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  }
  return {
    async preflight() {
      const response = await call('/api/events/material');
      assert(response.status === 401 && response.headers.get('x-commonwork-event-delivery') === 'server-stream-v1' && response.headers.get('x-commonwork-delivery-project') === REF, 'Preview binding/delivery configuration is absent or protection blocked preflight; no fixtures created.');
      await response.body?.cancel();
    },
    async material(actor, materialId, content, allowed) {
      const response = await call('/api/events/material', {
        method: 'POST', headers: { origin: target.origin, cookie: actor.cookie }, body: new URLSearchParams({ material_id: materialId }),
      });
      assert(!response.headers.has('location'), 'Application exposed an upstream redirect.');
      assert(response.headers.get('cache-control')?.includes('no-store'), 'Application delivery permits caching.');
      assert(response.headers.get('cache-control')?.includes('private'), 'Application delivery is not private.');
      const serialized = JSON.stringify([...response.headers]);
      assert(!/storage\/v1|token=|sb_secret_/i.test(serialized), 'Application leaked an upstream address or credential.');
      const text = await response.text();
      if (allowed) assert(response.status === 200 && text === content, 'Approved application delivery failed.');
      else assert([401, 403, 404].includes(response.status) && !text.includes(content), 'Unapproved application delivery exposed bytes.');
    },
  };
}
