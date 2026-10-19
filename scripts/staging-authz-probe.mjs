#!/usr/bin/env node
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';

const REF = 'jcpwiijzycjgsfvyeeyv';
const URL = `https://${REF}.supabase.co`;
const TAG = 'commonwork_staging_authz_batch';
const ROOT = resolve('supabase/.temp');
const ROLES = ['manager', 'attendee', 'outsider'];
class SafeFailure extends Error {}
function ensure(value, label) { if (!value) throw new SafeFailure(label); }
function ok(label, result) { ensure(!result.error, `${label} failed.`); return result.data; }
function empty(label, result) { ok(label, result); ensure(Array.isArray(result.data) && result.data.length === 0, `${label} exposed rows.`); }
function target(env) {
  ensure(env.COMMONWORK_ENV === 'staging', 'COMMONWORK_ENV must be staging.');
  ensure(env.SUPABASE_URL === URL || env.SUPABASE_URL === `${URL}/`, 'Refusing URL: only the pinned staging project is allowed.');
}
function legacyKey(key) { try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); } catch { return null; } }
function keys(env) {
  const adminKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const publicKey = env.SUPABASE_ANON_KEY ?? '';
  ensure(adminKey && publicKey, 'Staging public and service-role credentials are required.');
  const a = legacyKey(adminKey); const p = legacyKey(publicKey);
  ensure(adminKey.startsWith('sb_secret_') || (a?.role === 'service_role' && a.ref === REF), 'Invalid staging service-role credential type or project.');
  ensure(publicKey.startsWith('sb_publishable_') || (p?.role === 'anon' && p.ref === REF), 'The public credential must not be a service-role key.');
  return { adminKey, publicKey };
}
const options = { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: (input, init) => {
  const address = typeof input === 'string' ? input : input instanceof globalThis.URL ? input.href : input.url;
  ensure(new globalThis.URL(address).origin === URL, 'Refusing a request outside the pinned staging origin.');
  return fetch(input, { ...init, redirect: 'error' });
} } };
function save(m, file) { mkdirSync(ROOT, { recursive: true, mode: 0o700 }); writeFileSync(file, JSON.stringify(m, null, 2), { mode: 0o600 }); }
function validateManifest(m, file) {
  ensure(m.project === REF && /^[0-9a-f-]{36}$/i.test(m.batch), 'Invalid recovery manifest.');
  ensure(resolve(file) === resolve(ROOT, `staging-authz-${m.batch}.json`), 'Recovery manifest must be in the fixture directory.');
  ensure(m.eventSlug === `staging-authz-${m.batch}` && Array.isArray(m.users) && m.users.length === 3, 'Invalid fixture scope.');
  const seen = new Set();
  for (const p of m.users) {
    ensure(ROLES.includes(p.role) && !seen.has(p.role), 'Invalid fixture role.'); seen.add(p.role);
    ensure(p.email === `cw-authz-${m.batch}-${p.role}@example.test`, 'Invalid synthetic address.');
    ensure(p.id === null || /^[0-9a-f-]{36}$/i.test(p.id), 'Invalid synthetic ID.');
  }
}
async function confirm(phrase) {
  ensure(process.stdin.isTTY, 'Live staging actions require an interactive terminal.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { ensure(await rl.question(`Type "${phrase}" to continue: `) === phrase, 'Confirmation did not match.'); } finally { rl.close(); }
}
async function cleanup(admin, m, file) {
  validateManifest(m, file);
  const verified = [];
  for (const p of m.users.filter((u) => u.id)) {
    const found = await admin.auth.admin.getUserById(p.id);
    if (found.error?.status === 404) continue;
    const user = ok('Verify fixture ownership', found)?.user;
    ensure(user?.app_metadata?.[TAG] === m.batch && user.email === p.email, 'Cleanup refused: fixture ownership mismatch.');
    verified.push(p);
  }
  const manager = verified.find((p) => p.role === 'manager');
  if (manager) {
    const event = ok('Locate fixture event', await admin.rpc('manage_staging_authz_event', { target_batch: m.batch, target_manager_id: manager.id, delete_fixture: false }).maybeSingle());
    if (event) {
      ensure(event.manager_profile_id === manager.id, 'Cleanup refused: event ownership mismatch.');
      ok('Remove fixture storage object', await admin.storage.from('event-materials').remove([`${event.id}/authz-${m.batch}.txt`]));
      const removed = ok('Remove fixture event', await admin.rpc('manage_staging_authz_event', { target_batch: m.batch, target_manager_id: manager.id, delete_fixture: true }));
      ensure(removed?.length === 1 && removed[0].id === event.id, 'Cleanup event scope changed; retain the manifest.');
    }
  }
  for (const p of verified.reverse()) ok('Remove synthetic Auth account', await admin.auth.admin.deleteUser(p.id));
  ensure(!m.users.some((p) => !p.id && p.state === 'creating'), 'Unresolved Auth creation: retain the manifest for batch recovery before retrying.');
}

async function probe(admin, publicKey, m, file) {
  const sessions = {};
  for (const p of m.users) {
    p.state = 'creating'; save(m, file);
    const response = await admin.auth.admin.createUser({ email: p.email, password: `${randomBytes(32).toString('base64url')}Aa9!`, email_confirm: true, app_metadata: { [TAG]: m.batch } });
    if (response.error && response.error.status >= 400 && response.error.status < 500) { p.state = 'rejected'; save(m, file); }
    const user = ok('Create synthetic Auth account', response)?.user;
    ensure(user?.id, 'Synthetic Auth account response missing.'); p.id = user.id; p.state = 'created'; save(m, file);
    const generated = ok('Generate fixture-only sign-in token', await admin.auth.admin.generateLink({ type: 'magiclink', email: p.email }));
    ensure(generated.user?.id === p.id && generated.properties?.hashed_token, 'Fixture sign-in identity mismatch.');
    const client = createClient(URL, publicKey, options);
    const signed = ok('Authenticate synthetic account', await client.auth.verifyOtp({ token_hash: generated.properties.hashed_token, type: 'magiclink' }));
    ensure(signed.user?.id === p.id && signed.session?.access_token, 'Synthetic authentication failed.');
    sessions[p.role] = { client, token: signed.session.access_token, id: p.id };
  }
  const manager = sessions.manager; const attendee = sessions.attendee; const outsider = sessions.outsider;
  ok('Create fictional manager profile', await admin.from('profiles').insert({ id: manager.id, display_name: 'Synthetic staging manager', professional_summary: 'Fictional staging authorization fixture.', what_i_contribute: 'Synthetic test evidence only.', profile_visibility: 'members' }));
  ok('Grant synthetic workspace membership', await admin.from('workspace_memberships').insert({ user_id: manager.id, status: 'active', source: 'operator' }));
  ok('Appoint synthetic event manager', await admin.from('event_managers').insert({ profile_id: manager.id, status: 'active' }));
  const skill = ok('Read member competence vocabulary', await manager.client.from('competencies').select('id').eq('slug', 'product-data-quality').single());
  const pc = ok('Create synthetic competence', await admin.from('profile_competencies').insert({ profile_id: manager.id, competency_id: skill.id, discoverable: true }).select('id').single());
  ok('Create synthetic evidence', await admin.from('competence_evidence').insert({ profile_competency_id: pc.id, title: 'Synthetic test evidence', context: 'Fictional staging scenario', contribution: 'Synthetic authorization checks', outcome: 'No real-world claim', visibility: 'members' }));
  ok('Create closed synthetic contact preferences', await admin.from('contact_preferences').insert({ profile_id: manager.id }));
  const discovered = ok('Positive member discovery control', await manager.client.from('discoverable_profiles').select('id').eq('id', manager.id));
  ensure(discovered.length === 1, 'Positive discovery fixture missing.');
  const event = ok('Create event with manager JWT', await manager.client.from('events').insert({ slug: m.eventSlug, title: 'Synthetic staging authorization fixture', manager_profile_id: manager.id, is_published: true }).select('id').single());
  const path = `${event.id}/authz-${m.batch}.txt`; const content = `Synthetic authorization fixture ${m.batch}`;
  ok('Upload synthetic private object', await manager.client.storage.from('event-materials').upload(path, Buffer.from(content), { contentType: 'text/plain', upsert: false }));
  const material = ok('Create synthetic material metadata', await manager.client.from('event_materials').insert({ event_id: event.id, kind: 'guide', title: 'Synthetic text fixture, not a guide', storage_path: path }).select('id').single());
  async function workspaceDenied(actor) {
    ensure(ok('Check non-member permission', await actor.client.rpc('can_access_member_workspace')) === false, 'Unexpected workspace membership.');
    empty('Competence isolation', await actor.client.from('competencies').select('id').eq('id', skill.id));
    empty('Discovery isolation', await actor.client.from('discoverable_profiles').select('id').eq('id', manager.id));
    for (const [name, args] of [['get_my_introduction_inbox', {}], ['get_need_product_suggestions', { target_need_id: m.batch }]]) {
      const r = await actor.client.rpc(name, args);
      ensure(r.error?.code === '42501' && r.error.message === 'Workspace membership is required.' && r.data === null, 'Business RPC did not enforce membership.');
    }
  }
  async function materialDenied(actor) {
    empty('Material metadata isolation', await actor.client.from('event_materials').select('id').eq('id', material.id));
    const download = await actor.client.storage.from('event-materials').download(path);
    ensure(download.error && download.data === null, 'Private storage object was readable.');
  }
  await workspaceDenied(attendee); await workspaceDenied(outsider); await materialDenied(attendee); await materialDenied(outsider);
  const initial = ok('Check no initial attendee profile', await admin.from('profiles').select('id').eq('id', attendee.id).maybeSingle());
  ensure(initial === null, 'Attendee already had a profile.');
  ensure(ok('Request event as attendee', await attendee.client.rpc('request_event_attendance', { target_event_id: event.id })) === 'requested', 'Event request failed.');
  const profile = ok('Check minimal attendee profile', await admin.from('profiles').select('profile_visibility, professional_summary, onboarding_completed').eq('id', attendee.id).single());
  ensure(profile.profile_visibility === 'private' && profile.professional_summary === '' && profile.onboarding_completed === false, 'Attendee profile was not minimal/private.');
  empty('No attendee contact opt-in', await admin.from('contact_preferences').select('profile_id').eq('profile_id', attendee.id));
  const selfGrant = await attendee.client.from('workspace_memberships').insert({ user_id: attendee.id, status: 'active', source: 'operator' });
  ensure(selfGrant.error?.code === '42501', 'Self-grant was not refused.');
  await attendee.client.from('event_attendees').update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: attendee.id }).eq('event_id', event.id).eq('profile_id', attendee.id);
  const pending = ok('Check self-approval did not change state', await attendee.client.from('event_attendees').select('status').eq('event_id', event.id).eq('profile_id', attendee.id).single());
  ensure(pending.status === 'requested', 'Attendee self-approved.'); await materialDenied(attendee);
  ok('Manager approves synthetic attendance', await manager.client.from('event_attendees').update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: manager.id }).eq('event_id', event.id).eq('profile_id', attendee.id).select('status').single());
  ensure(ok('Check approved event permission', await attendee.client.rpc('has_approved_event_access', { target_event_id: event.id })) === true, 'Approval was not effective.');
  const allowed = ok('Approved material metadata', await attendee.client.from('event_materials').select('id').eq('id', material.id));
  ensure(allowed.length === 1, 'Approved metadata unavailable.');
  const blob = ok('Approved private object download', await attendee.client.storage.from('event-materials').download(path));
  ensure(await blob.text() === content, 'Approved object content mismatch.');
  await workspaceDenied(attendee); await materialDenied(outsider);
  ok('Manager revokes synthetic attendance', await manager.client.from('event_attendees').update({ status: 'revoked', decided_at: new Date().toISOString(), decided_by: manager.id }).eq('event_id', event.id).eq('profile_id', attendee.id).select('status').single());
  ensure(ok('Check revoked event permission', await attendee.client.rpc('has_approved_event_access', { target_event_id: event.id })) === false, 'Revocation was not effective.');
  await materialDenied(attendee);
  const session = ok('Read unchanged synthetic session', await attendee.client.auth.getSession());
  ensure(session.session?.access_token === attendee.token, 'Attendee token changed during approval/revocation.');
  ok('Revoke only synthetic workspace membership', await admin.from('workspace_memberships').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('user_id', manager.id));
  ensure(ok('Check workspace revocation', await manager.client.rpc('can_access_member_workspace')) === false, 'Workspace revocation was not effective.');
  empty('Revoked member vocabulary access', await manager.client.from('competencies').select('id').eq('id', skill.id));
}

async function main() {
  const [mode = '--dry-run', manifestArg] = process.argv.slice(2); target(process.env);
  ensure(['--dry-run', '--run', '--cleanup'].includes(mode), 'Use --dry-run, --run or --cleanup <manifest>.');
  if (mode === '--dry-run') { console.log(JSON.stringify({ project: REF, mode, writes: false, network: false, syntheticAccounts: 3, event: 1, privateTextObject: 1 })); return; }
  const { adminKey, publicKey } = keys(process.env);
  const admin = createClient(URL, adminKey, options);
  const preflight = await admin.rpc('manage_staging_authz_event', { target_batch: randomUUID(), target_manager_id: randomUUID(), delete_fixture: false });
  ensure(preflight.error?.code === '42501' && preflight.error.message === 'Synthetic fixture ownership is required.', 'Required fixture-scoped cleanup RPC is not ready; no accounts created.');
  if (mode === '--cleanup') {
    ensure(manifestArg, 'Supply the recovery manifest path.');
    const file = resolve(manifestArg); const m = JSON.parse(readFileSync(file, 'utf8')); validateManifest(m, file);
    console.log(JSON.stringify({ project: REF, batch: m.batch, fixtureIds: m.users.map((p) => p.id), eventSlug: m.eventSlug }));
    await confirm(`DELETE SYNTHETIC AUTHZ BATCH ${m.batch} IN ${REF}`);
    await cleanup(admin, m, file); unlinkSync(file); console.log('Tracked synthetic fixtures removed.'); return;
  }
  const batch = randomUUID();
  const m = { project: REF, batch, eventSlug: `staging-authz-${batch}`, users: ROLES.map((role) => ({ role, email: `cw-authz-${batch}-${role}@example.test`, id: null, state: 'planned' })) };
  const file = resolve(ROOT, `staging-authz-${batch}.json`);
  console.log(JSON.stringify({ project: REF, batch, syntheticAddresses: m.users.map((p) => p.email), eventSlug: m.eventSlug, privateTextObject: 1 }));
  await confirm(`CREATE AND DELETE SYNTHETIC AUTHZ FIXTURES IN ${REF}`); save(m, file);
  let failure = null;
  try { await probe(admin, publicKey, m, file); } catch (error) { failure = error; }
  let cleaned = false;
  try { await cleanup(admin, m, file); cleaned = true; } catch { failure ??= new SafeFailure('Fixture cleanup failed.'); }
  if (failure) { console.error(`Probe failed; trackedCleanup=${cleaned}. Retain recovery manifest: ${file}`); throw failure; }
  unlinkSync(file);
  console.log(JSON.stringify({ project: REF, passed: true, trackedFixturesCleaned: true, sameAttendeeSession: true, liveEmailSignupTested: false, previewBrowserTested: false }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof SafeFailure ? error.message : 'Probe stopped. Do not share raw errors or credentials; retain the recovery manifest.'); process.exitCode = 1; });
}
