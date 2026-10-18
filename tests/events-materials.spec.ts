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

async function useMember(page: Page, member: LocalMember): Promise<void> {
  await page.context().addCookies(member.cookies);
}

test.beforeAll(async () => {
  admin = createLocalAdminClient();
  manager = await createLocalMember('Event manager');
  attendee = await createLocalMember('Approved attendee');
  unapproved = await createLocalMember('Unapproved attendee');

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

  const { error: materialsError } = await admin.from('event_materials').insert([
    { event_id: eventId, kind: 'presentation', title: 'Agentic commerce presentation', storage_path: `${eventId}/presentation.pdf` },
    { event_id: eventId, kind: 'guide', title: 'Retailer print guide', storage_path: storagePath },
  ]);
  if (materialsError) throw materialsError;
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
  await expect(page.getByRole('link', { name: 'Open browser presentation' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Read audience guide' })).toHaveCount(0);

  for (const path of ['presentation', 'guide', 'guide/print']) {
    await page.goto(`/events/${slug}/${path}`);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?return_to=`));
  }
  await page.goto('/playbook/present');
  await expect(page).toHaveURL(/\/sign-in\?return_to=/);
});

test('authenticated unapproved members cannot open any attendee playbook view', async ({ page }) => {
  if (!unapproved) throw new Error('Test attendee was not created.');
  await useMember(page, unapproved);

  for (const path of ['presentation', 'guide', 'guide/print']) {
    const response = await page.goto(`/events/${slug}/${path}`);
    expect(response?.status()).toBe(403);
    await expect(page.getByText('Approved event attendee access is required.')).toBeVisible();
  }
});

test('approved attendees can open the presentation and guide and download the protected print PDF', async ({ page }) => {
  if (!attendee) throw new Error('Approved test attendee was not created.');
  await useMember(page, attendee);

  await page.goto(`/events/${slug}`);
  await expect(page.getByRole('link', { name: 'Open browser presentation' })).toHaveAttribute(
    'href',
    `/events/${slug}/presentation`,
  );
  await expect(page.getByRole('link', { name: 'Read audience guide' })).toHaveAttribute(
    'href',
    `/events/${slug}/guide`,
  );

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/events/${slug}/presentation#opening`);
  await expect(page.getByRole('heading', { level: 1, name: 'Agentic Commerce: When AI Enters the Shopping Journey' })).toBeVisible();
  const slideFits = await page.locator('.pb-slide.is-active').evaluate((slide) => slide.scrollHeight <= slide.clientHeight + 2);
  expect(slideFits).toBe(true);

  await page.goto(`/events/${slug}/presentation#next-retailer-test`);
  await page.getByRole('button', { name: 'Panel Debate Statements' }).click();
  await expect(page.getByRole('dialog')).toContainText('Discovery & Data Governance');
  await expect(page.getByRole('dialog')).toContainText('Channel Control & Margin');
  await expect(page.getByRole('dialog')).toContainText('Operating Model & Competence');

  await page.goto(`/events/${slug}/guide`);
  await expect(page.getByRole('heading', { level: 1, name: 'The buying journey is changing before customers reach your shop.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Print or download retailer guide' })).toHaveAttribute(
    'href',
    `/events/${slug}/guide/print`,
  );

  await page.goto(`/events/${slug}/guide/print`);
  await expect(page.getByRole('heading', { level: 1, name: 'The buying journey is changing before customers reach your shop.' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download print-guide PDF' }).click();
  expect((await download).suggestedFilename()).toBe('retailer-guide.pdf');
});
