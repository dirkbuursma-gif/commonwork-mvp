import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalMember, type LocalMember } from './helpers/local-supabase';

test('event approval does not grant catalogue access; members retain access until workspace revocation', async () => {
  test.setTimeout(60_000);
  const admin = createLocalAdminClient();
  const suffix = randomUUID();
  let member: LocalMember | undefined;
  let attendee: LocalMember | undefined;
  let providerId: string | undefined;
  let eventId: string | undefined;
  try {
    member = await createLocalMember('Local catalogue member');
    attendee = await createLocalMember('Local event-only attendee', { workspaceAccess: false });
    const profiles = await admin.from('profiles').insert([
      { id: member.id, display_name: 'Local catalogue member' },
      { id: attendee.id, display_name: 'Local event-only attendee' },
    ]);
    expect(profiles.error).toBeNull();

    const provider = await admin.from('providers').insert({
      slug: `boundary-provider-${suffix}`, name: 'Local catalogue boundary provider',
      source_system: 'local-workspace-access-test', source_record_id: suffix,
    }).select('id').single();
    expect(provider.error).toBeNull();
    if (!provider.data) throw new Error('Local provider fixture missing.');
    providerId = provider.data.id;
    const product = await admin.from('provider_products').insert({
      provider_id: providerId, slug: `boundary-product-${suffix}`, name: 'Local catalogue boundary product',
      source_system: 'local-workspace-access-test', source_record_id: suffix,
    }).select('id').single();
    expect(product.error).toBeNull();
    if (!product.data) throw new Error('Local product fixture missing.');
    const publications = await admin.from('provider_publication_status').insert([
      { provider_id: providerId, status: 'published', published_at: new Date().toISOString() },
      { provider_product_id: product.data.id, status: 'published', published_at: new Date().toISOString() },
    ]);
    expect(publications.error).toBeNull();

    const memberRead = await member.client.from('provider_products').select('id').eq('id', product.data.id);
    expect(memberRead.error).toBeNull();
    expect(memberRead.data).toEqual([{ id: product.data.id }]);
    const deniedClient = attendee.client;
    const assertCatalogueDenied = async () => {
      for (const [table, columns] of [
        ['provider_categories', 'id'], ['providers', 'id'], ['provider_products', 'id'],
        ['provider_category_memberships', 'provider_product_id'], ['provider_links', 'id'],
        ['provider_publication_status', 'provider_id, provider_product_id, status'],
        ['category_competency_links', 'category_id'],
      ]) {
        const result = await deniedClient.from(table).select(columns);
        expect(result.error, table).toBeNull();
        expect(result.data, table).toEqual([]);
      }
    };
    await assertCatalogueDenied();

    const event = await admin.from('events').insert({
      slug: `workspace-boundary-${suffix}`, title: 'Local catalogue boundary event',
      manager_profile_id: member.id, is_published: true,
    }).select('id').single();
    expect(event.error).toBeNull();
    if (!event.data) throw new Error('Local event fixture missing.');
    eventId = event.data.id;
    const approval = await admin.from('event_attendees').insert({
      event_id: eventId, profile_id: attendee.id, status: 'approved',
      decided_at: new Date().toISOString(), decided_by: member.id,
    });
    expect(approval.error).toBeNull();
    const eventAccess = await attendee.client.rpc('has_approved_event_access', { target_event_id: eventId });
    expect(eventAccess.error).toBeNull();
    expect(eventAccess.data).toBe(true);
    const workspaceAccess = await attendee.client.rpc('can_access_member_workspace');
    expect(workspaceAccess.error).toBeNull();
    expect(workspaceAccess.data).toBe(false);
    await assertCatalogueDenied();

    const revoke = await admin.from('workspace_memberships')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('user_id', member.id);
    expect(revoke.error).toBeNull();
    const revokedRead = await member.client.from('provider_products').select('id').eq('id', product.data.id);
    expect(revokedRead.error).toBeNull();
    expect(revokedRead.data).toEqual([]);
  } finally {
    if (eventId) await admin.from('events').delete().eq('id', eventId);
    if (providerId) await admin.from('providers').delete().eq('id', providerId);
    await Promise.all([member?.remove(), attendee?.remove()]);
  }
});
