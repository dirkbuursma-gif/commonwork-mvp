import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createLocalAdminClient,
  createLocalAnonymousClient,
  createLocalMember,
} from './helpers/local-supabase';

test('Insights database policies keep drafts private without granting anonymous editor execution', async () => {
  test.setTimeout(60_000);
  const admin = createLocalAdminClient();
  const anonymous = createLocalAnonymousClient();
  const editor = await createLocalMember('Local Insights Policy Editor');
  let reader: Awaited<ReturnType<typeof createLocalMember>> | undefined;
  const publishedId = randomUUID();
  const draftId = randomUUID();
  const articleIds = [publishedId, draftId];
  const suffix = randomUUID();

  try {
    reader = await createLocalMember('Local Insights Policy Reader');
    const { error: profileError } = await admin.from('profiles').insert([
      { id: editor.id, display_name: 'Local Insights Policy Editor' },
      { id: reader.id, display_name: 'Local Insights Policy Reader' },
    ]);
    expect(profileError).toBeNull();
    await editor.provisionAdministrator();

    const common = {
      author_profile_id: editor.id,
      desk: 'Ecosystem',
      format: 'Brief',
      body: 'Local-only database access regression fixture.',
    };
    const { error: insertError } = await admin.from('insight_articles').insert([
      {
        ...common,
        id: publishedId,
        slug: `policy-published-${suffix}`,
        title: 'Published local policy fixture',
        status: 'published',
        published_at: new Date().toISOString(),
      },
      {
        ...common,
        id: draftId,
        slug: `policy-draft-${suffix}`,
        title: 'Draft local policy fixture',
        status: 'draft',
      },
    ]);
    expect(insertError).toBeNull();

    for (const client of [anonymous, reader.client]) {
      const { data, error } = await client.from('insight_articles')
        .select('id, status').in('id', articleIds);
      expect(error).toBeNull();
      expect(data).toEqual([{ id: publishedId, status: 'published' }]);
    }

    const { data: editorialRows, error: editorialError } = await editor.client
      .from('insight_articles').select('id').in('id', articleIds);
    expect(editorialError).toBeNull();
    expect((editorialRows ?? []).map((row) => row.id).sort())
      .toEqual([...articleIds].sort());

    const { data: editorPermission, error: permissionError } = await anonymous
      .rpc('can_edit_insights');
    expect(permissionError).not.toBeNull();
    expect(editorPermission).toBeNull();
  } finally {
    try {
      const { error: cleanupError } = await admin.from('insight_articles')
        .delete().in('id', articleIds);
      expect(cleanupError).toBeNull();
    } finally {
      if (reader) await reader.remove();
      await editor.remove();
    }
  }
});
