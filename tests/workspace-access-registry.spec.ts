import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalAnonymousClient, createLocalMember, type LocalMember } from './helpers/local-supabase';

test('workspace registry rejects self-escalation and isolates operator grants and revocations', async () => {
  test.setTimeout(60_000);
  const admin = createLocalAdminClient();
  const anonymous = createLocalAnonymousClient();
  let first: LocalMember | undefined;
  let second: LocalMember | undefined;
  try {
    first = await createLocalMember('Local workspace registry first');
    second = await createLocalMember('Local workspace registry second');

    for (const member of [first, second]) {
      const { data, error } = await member.client.rpc('can_access_member_workspace');
      expect(error).toBeNull();
      expect(data).toBe(false);
    }
    const anonymousCheck = await anonymous.rpc('can_access_member_workspace');
    expect(anonymousCheck.error).not.toBeNull();
    expect(anonymousCheck.data).toBeNull();

    const spoof = await second.client.auth.updateUser({ data: { workspace_access: true, role: 'member' } });
    expect(spoof.error).toBeNull();
    const afterSpoof = await second.client.rpc('can_access_member_workspace');
    expect(afterSpoof.error).toBeNull();
    expect(afterSpoof.data).toBe(false);

    const selfGrant = await second.client.from('workspace_memberships').insert({ user_id: second.id, status: 'active', source: 'operator' });
    expect(selfGrant.error).not.toBeNull();
    const privateRead = await second.client.from('workspace_memberships').select('user_id, status');
    expect(privateRead.error).not.toBeNull();

    const operatorGrant = await admin.from('workspace_memberships').insert({ user_id: first.id, status: 'active', source: 'operator' });
    expect(operatorGrant.error).toBeNull();
    const firstAllowed = await first.client.rpc('can_access_member_workspace');
    expect(firstAllowed.error).toBeNull();
    expect(firstAllowed.data).toBe(true);
    const secondDenied = await second.client.rpc('can_access_member_workspace');
    expect(secondDenied.error).toBeNull();
    expect(secondDenied.data).toBe(false);

    const selfRevoke = await first.client.from('workspace_memberships')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('user_id', first.id);
    expect(selfRevoke.error).not.toBeNull();
    const changeOther = await second.client.from('workspace_memberships')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('user_id', first.id);
    expect(changeOther.error).not.toBeNull();
    const stillAllowed = await first.client.rpc('can_access_member_workspace');
    expect(stillAllowed.error).toBeNull();
    expect(stillAllowed.data).toBe(true);

    const operatorRevoke = await admin.from('workspace_memberships')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('user_id', first.id);
    expect(operatorRevoke.error).toBeNull();
    const revoked = await first.client.rpc('can_access_member_workspace');
    expect(revoked.error).toBeNull();
    expect(revoked.data).toBe(false);

    const selfRestore = await first.client.from('workspace_memberships')
      .update({ status: 'active', revoked_at: null }).eq('user_id', first.id);
    expect(selfRestore.error).not.toBeNull();
    const selfDelete = await second.client.from('workspace_memberships').delete().eq('user_id', first.id);
    expect(selfDelete.error).not.toBeNull();
    const remainsRevoked = await first.client.rpc('can_access_member_workspace');
    expect(remainsRevoked.error).toBeNull();
    expect(remainsRevoked.data).toBe(false);
  } finally {
    await Promise.all([first?.remove(), second?.remove()]);
  }
});
