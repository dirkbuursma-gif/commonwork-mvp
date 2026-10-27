import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalAnonymousClient, createLocalMember, type LocalMember } from './helpers/local-supabase';

test('service-only cleanup addresses only a trusted tagged owner and exact synthetic event', async () => {
  test.setTimeout(60_000);
  const admin = createLocalAdminClient();
  const anonymous = createLocalAnonymousClient();
  const batch = randomUUID();
  const forgedBatch = randomUUID();
  const ids: string[] = [];
  const events: string[] = [];
  let member: LocalMember | undefined;
  try {
    member = await createLocalMember('Local cleanup caller');
    for (const [key, trusted] of [[batch, true], [forgedBatch, false]] as const) {
      const created = await admin.auth.admin.createUser({
        email: `cw-authz-${key}-manager@example.test`, email_confirm: true,
        ...(trusted ? { app_metadata: { commonwork_staging_authz_batch: key } } : { user_metadata: { commonwork_staging_authz_batch: key } }),
      });
      expect(created.error).toBeNull();
      if (!created.data.user) throw new Error('Synthetic cleanup owner missing.');
      ids.push(created.data.user.id);
      expect((await admin.from('profiles').insert({ id: created.data.user.id, display_name: 'Local cleanup fixture' })).error).toBeNull();
      const e = await admin.from('events').insert({ slug: `staging-authz-${key}`, title: 'Local cleanup fixture', manager_profile_id: created.data.user.id }).select('id').single();
      expect(e.error).toBeNull();
      if (!e.data) throw new Error('Synthetic cleanup event missing.');
      events.push(e.data.id);
    }
    const control = await admin.from('events').insert({ slug: `control-${batch}`, title: 'Unrelated event control', manager_profile_id: ids[0] }).select('id').single();
    expect(control.error).toBeNull();
    if (!control.data) throw new Error('Control event missing.');
    events.push(control.data.id);
    const args = { target_batch: batch, target_manager_id: ids[0], delete_fixture: false };
    const found = await admin.rpc('manage_staging_authz_event', args);
    expect(found.error).toBeNull();
    expect(found.data).toEqual([{ id: events[0], manager_profile_id: ids[0] }]);
    const untouched = await admin.from('events').select('id').eq('id', events[0]);
    expect(untouched.error).toBeNull(); expect(untouched.data).toHaveLength(1);
    for (const client of [member.client, anonymous]) {
      const denied = await client.rpc('manage_staging_authz_event', { ...args, delete_fixture: true });
      expect(denied.error?.code).toBe('42501'); expect(denied.data).toBeNull();
    }
    const forged = await admin.rpc('manage_staging_authz_event', { target_batch: forgedBatch, target_manager_id: ids[1], delete_fixture: true });
    expect(forged.error?.code).toBe('42501'); expect(forged.data).toBeNull();
    const wrongBatch = await admin.rpc('manage_staging_authz_event', { ...args, target_batch: randomUUID() });
    expect(wrongBatch.error?.code).toBe('42501');
    const removed = await admin.rpc('manage_staging_authz_event', { ...args, delete_fixture: true });
    expect(removed.error).toBeNull(); expect(removed.data).toEqual(found.data);
    const remaining = await admin.from('events').select('id').in('id', events);
    expect(remaining.error).toBeNull();
    expect(remaining.data).toEqual(expect.arrayContaining([{ id: events[1] }, { id: events[2] }]));
    expect(remaining.data).toHaveLength(2);
    const repeated = await admin.rpc('manage_staging_authz_event', { ...args, delete_fixture: true });
    expect(repeated.error).toBeNull(); expect(repeated.data).toEqual([]);
  } finally {
    if (events.length) await admin.from('events').delete().in('id', events);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
    await member?.remove();
  }
});
