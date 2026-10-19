import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createLocalAdminClient, createLocalMember, type LocalMember } from './helpers/local-supabase';

const eventId = randomUUID();
const slug = `playbook-${randomUUID().slice(0, 8)}`;
const storagePath = `${eventId}/retailer-guide.pdf`;
let manager: LocalMember | undefined;
let attendee: LocalMember | undefined;
let unapproved: LocalMember | undefined;
let admin: ReturnType<typeof createLocalAdminClient> | undefined;
let guideMaterialId: string | undefined;

async function useMember(page: Page, member: LocalMember): Promise<void> {
  await page.context().addCookies(member.cookies.map(({ name, value, url }) => ({ name, value, url })));
}

test.beforeAll(async () => {
  admin = createLocalAdminClient();
  manager = await createLocalMember('Event manager');
  attendee = await createLocalMember('Approved attendee');
  unapproved = await createLocalMember('Unapproved attendee');

  const { error: profileError } = await admin.from('profiles').insert([
    { id: manager.id, display_name: 'Event manager' },
    { id: attendee.id, display_name: 'Approved attendee' },
    { id: unapproved.id, display_name: 'Unapproved attendee' },
  ]);
  if (profileError) throw profileError;

  const { error: eventError } = await admin.from('events').insert({
    id: eventId,
    slug,
    title: 'Agentic commerce Lisbon session',
    summary: 'Presentation and attendee guide.',
    location: 'Lisbon',
    is_published: true,
    manager_profile_id: manager.id,
  });
  if (eventError) throw eventError;

  const { error: attendanceError } = await admin.from('event_attendees').insert([
    { event_id: eventId, profile_id: attendee.id, status: 'approved', decided_at: new Date().toISOString(), decided_by: manager.id },
    { event_id: eventId, profile_id: unapproved.id, status: 'requested' },
  ]);
  if (attendanceError) throw attendanceError;

  const { error: objectError } = await admin.storage
    .from('event-materials')
    .upload(storagePath, Buffer.from('%PDF-1.4\n% local event material test\n%%EOF'), {
      contentType: 'application/pdf',
    });
  if (objectError) throw objectError;

  const { data: materials, error: materialsError } = await admin.from('event_materials').insert([
    { event_id: eventId, kind: 'presentation', title: 'Agentic commerce presentation', storage_path: `${eventId}/presentation.pdf` },
    { event_id: eventId, kind: 'guide', title: 'Retailer print guide', storage_path: storagePath },
  ]).select('id, kind');
  if (materialsError) throw materialsError;
  guideMaterialId = materials?.find((material) => material.kind === 'guide')?.id;
  if (!guideMaterialId) throw new Error('Local guide material fixture was not created.');
});

test.afterAll(async () => {
  if (admin) {
    await admin.storage.from('event-materials').remove([storagePath, `${eventId}/presentation.pdf`]);
    await admin.from('events').delete().eq('id', eventId);
  }
  await Promise.all([manager?.remove(), attendee?.remove(), unapproved?.remove()]);
});

test('anonymous visitors can see event details but not attendee material routes', async ({ page }) => {
  await page.goto(`/events/${slug}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Agentic commerce Lisbon session' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open presentation', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Read guide online', exact: true })).toHaveCount(0);
  await expect(page.locator('form[action="/api/events/material"]')).toHaveCount(0);

  for (const path of ['presentation', 'guide', 'guide/print']) {
    const response = await page.request.get(`/events/${slug}/${path}`, { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    const destination = new URL(response.headers().location, page.url());
    expect(destination.origin).toBe(new URL(page.url()).origin);
    expect(destination.pathname).toBe('/sign-in');
    expect(destination.searchParams.get('return_to')).toBeNull();
    await page.goto(`/events/${slug}/${path}`);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
  await page.goto('/playbook/present');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('authenticated unapproved members cannot open any attendee playbook view or download its PDF', async ({ page }) => {
  if (!unapproved || !guideMaterialId) throw new Error('Local attendee fixtures were not created.');
  await useMember(page, unapproved);

  for (const path of ['presentation', 'guide', 'guide/print']) {
    const response = await page.goto(`/events/${slug}/${path}`);
    expect(response?.status()).toBe(403);
    await expect(page.getByText('Approved event attendee access is required.')).toBeVisible();
  }
  const deniedDownload = await page.request.post('/api/events/material', {
    form: { material_id: guideMaterialId },
    headers: { origin: new URL(page.url()).origin },
    maxRedirects: 0,
  });
  expect(deniedDownload.status()).toBe(403);
  expect(deniedDownload.headers().location).toBeUndefined();
});

test('approved attendees can use revised materials, print the worksheet and download the protected guide PDF', async ({ page }) => {
  if (!attendee) throw new Error('Approved test attendee was not created.');
  await useMember(page, attendee);

  await page.goto(`/events/${slug}`);
  await expect(page.getByRole('link', { name: 'Open presentation', exact: true }))
    .toHaveAttribute('href', `/events/${slug}/presentation`);
  await expect(page.getByRole('link', { name: 'Read guide online', exact: true }))
    .toHaveAttribute('href', `/events/${slug}/guide`);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download retailer guide', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('retailer-guide.pdf');
  expect(await download.failure()).toBeNull();

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/events/${slug}/presentation#opening`);
  const stage = page.locator('[data-lr-mode="presentation"]');
  await expect(stage).toHaveAttribute('data-lr-enhanced', 'true');
  await expect(stage.locator('[data-lr-slide]')).toHaveCount(9);
  await expect(page.getByRole('heading', { level: 1, name: 'Agentic Commerce: When AI Enters the Shopping Journey', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => stage.locator('.lr-main').evaluate((element) =>
    Math.max(element.scrollHeight - element.clientHeight, element.scrollWidth - element.clientWidth),
  )).toBeLessThanOrEqual(3);

  await page.goto(`/events/${slug}/presentation#next-retailer-test`);
  await page.locator('.lr-debate summary').click();
  const debate = page.locator('.lr-debate[open]');
  await expect(debate).toContainText('Discovery & Data Governance');
  await expect(debate).toContainText('Channel Control & Margin');
  await expect(debate).toContainText('Operating Model & Competence');

  await page.goto(`/events/${slug}/guide`);
  await expect(page.locator('[data-lr-mode="guide"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'One category. Three questions. One evidence-led next step.', exact: true })).toBeVisible();
  await expect(page.locator('.lr-worksheet textarea').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Print / save guide and worksheet', exact: true }))
    .toHaveAttribute('href', `/events/${slug}/guide/print#take-home-exercise`);

  await page.goto(`/events/${slug}/guide/print`);
  await expect(page.locator('[data-lr-mode="print"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'One category. Three questions. One evidence-led next step.', exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.print = () => { document.body.setAttribute('data-test-print-requested', 'true'); };
  });
  await page.getByRole('button', { name: 'Print / save guide and worksheet as PDF', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-test-print-requested', 'true');
});
