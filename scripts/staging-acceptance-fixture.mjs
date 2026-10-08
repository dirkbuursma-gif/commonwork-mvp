#!/usr/bin/env node
import { randomBytes, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const projectRef = 'xnuwtcvwznaxxbvuwgxz';
const projectHost = `${projectRef}.supabase.co`;
const batchMetadataKey = 'commonwork_staging_acceptance_batch';
const batchShortNames = [
  { role: 'Requester', competencies: ['composable-commerce', 'platform-assessment', 'cross-functional-collaboration'] },
  { role: 'Recipient', competencies: ['composable-commerce', 'product-data-quality', 'program-leadership'] },
  { role: 'Connector', competencies: ['platform-assessment', 'systems-integration', 'stakeholder-alignment'] },
  { role: 'Unrelated member', competencies: ['product-data-quality', 'workflow-automation', 'evidence-led-decision-making'] },
  { role: 'Second requester', competencies: ['composable-commerce', 'marketplace-operations', 'reliable-follow-through'] },
];

function resultData(label, result) {
  if (result.error) {
    const status = Number.isInteger(result.error.status) ? `, HTTP ${result.error.status}` : '';
    const code = typeof result.error.code === 'string' ? `, ${result.error.code}` : '';
    throw new Error(`${label} failed${status}${code}.`);
  }
  return result.data;
}

function getClient() {
  if (process.env.COMMONWORK_ENV !== 'staging') {
    throw new Error('Set COMMONWORK_ENV=staging before running this command.');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Set SUPABASE_SERVICE_ROLE_KEY in the terminal environment.');
  }
  const url = process.env.SUPABASE_URL;
  if (!url || new URL(url).hostname !== projectHost) {
    throw new Error(`SUPABASE_URL must target ${projectHost}.`);
  }
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function confirmStaging(rl, phrase) {
  const answer = await rl.question(`Type "${phrase}" to continue: `);
  if (answer !== phrase) throw new Error('Confirmation did not match; no changes made.');
}

function aliasFor(baseEmail, batchTag, index) {
  const atIndex = baseEmail.lastIndexOf('@');
  const local = baseEmail.slice(0, atIndex);
  const domain = baseEmail.slice(atIndex + 1);
  const email = `${local}+cw-accept-${batchTag}-${index + 1}@${domain}`;
  if (local.length + `+cw-accept-${batchTag}-${index + 1}`.length > 64 || email.length > 254) {
    throw new Error('The base address is too long for plus-address aliases.');
  }
  return email;
}

async function findBatchUsers(admin, batchId) {
  const found = [];
  const perPage = 100;
  for (let page = 1; ; page += 1) {
    const response = resultData('List Auth users', await admin.auth.admin.listUsers({ page, perPage }));
    found.push(...response.users.filter((user) => user.app_metadata?.[batchMetadataKey] === batchId));
    if (response.users.length < perPage) return found;
  }
}

async function deleteBatch(admin, batchId) {
  const users = await findBatchUsers(admin, batchId);
  for (const user of users) {
    resultData('Delete temporary Auth user', await admin.auth.admin.deleteUser(user.id));
  }
  return users.length;
}

async function prepare(admin, rl) {
  const baseEmail = (await rl.question('Base inbox address for plus aliases: ')).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(baseEmail)) throw new Error('Enter a valid base email address.');
  await confirmStaging(rl, `CREATE FIVE TEMP USERS IN ${projectRef}`);

  const batchId = randomUUID();
  const batchTag = batchId.slice(0, 8);
  const slugs = [...new Set(batchShortNames.flatMap((member) => member.competencies))];
  const catalogRows = resultData('Load active competencies', await admin.from('competencies')
    .select('id, slug').eq('status', 'active').in('slug', slugs));
  const competencyIds = new Map(catalogRows.map((row) => [row.slug, row.id]));
  const missing = slugs.filter((slug) => !competencyIds.has(slug));
  if (missing.length) throw new Error(`Required active competencies are missing (${missing.join(', ')}).`);

  try {
    const users = [];
    for (let index = 0; index < batchShortNames.length; index += 1) {
      const fixture = batchShortNames[index];
      const displayName = `Acceptance Test ${String(index + 1).padStart(2, '0')}`;
      const email = aliasFor(baseEmail, batchTag, index);
      const password = `${randomBytes(24).toString('base64url')}aA1!`;
      const authResult = resultData('Create temporary Auth user', await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: displayName, acceptance_role: fixture.role },
        app_metadata: { [batchMetadataKey]: batchId },
      }));
      users.push({ id: authResult.user.id, email, displayName, role: fixture.role, competencies: fixture.competencies });
    }

    for (const user of users) {
      resultData('Create temporary profile', await admin.from('profiles').insert({
        id: user.id,
        display_name: user.displayName,
        professional_summary: `Temporary fictional staging acceptance profile (${user.role.toLowerCase()}).`,
        what_i_contribute: 'A practical perspective on commerce operations, platform choices and implementation trade-offs.',
        what_i_am_exploring: 'Ways to make trusted, useful peer introductions easier to act on.',
        profile_visibility: 'members',
      }));

      const competencyRows = user.competencies.map((slug) => ({
        profile_id: user.id,
        competency_id: competencyIds.get(slug),
        member_statement: `Temporary acceptance fixture: applies ${slug.replaceAll('-', ' ')} to practical commerce work.`,
        evidence_status: 'declared',
        discoverable: true,
      }));
      const insertedCompetencies = resultData('Create temporary competencies', await admin
        .from('profile_competencies').insert(competencyRows).select('id, competency_id'));

      const evidenceRows = insertedCompetencies.map((competency, evidenceIndex) => ({
        profile_competency_id: competency.id,
        title: `Temporary acceptance example ${evidenceIndex + 1}`,
        context: 'Fictional staging-only scenario created for pilot acceptance testing.',
        contribution: 'Compared practical options, documented assumptions and surfaced implementation trade-offs.',
        outcome: 'The fictional team had a clearer decision and an actionable follow-up.',
        visibility: 'members',
      }));
      resultData('Create temporary evidence', await admin.from('competence_evidence').insert(evidenceRows));

      resultData('Create temporary contact preferences', await admin.from('contact_preferences').insert({
        profile_id: user.id,
        open_to_peer_exchange: true,
        open_to_advisory: true,
        availability_status: 'selective',
        conversation_capacity: 2,
      }));
      resultData('Create temporary private contact method', await admin.from('profile_contact_methods').insert({
        profile_id: user.id,
        method_type: 'email',
        value: user.email,
        label: 'Temporary test inbox',
        is_primary: true,
      }));
    }

    resultData('Activate temporary Connector account', await admin.from('connectors').insert({
      profile_id: users[2].id,
      status: 'active',
      introduction_capacity: 2,
      approved_at: new Date().toISOString(),
    }));

    console.log(`Created five temporary fictional staging accounts. Batch ID: ${batchId}`);
    for (const user of users) console.log(`${user.role}: ${user.email}`);
    console.log(`Cleanup command: node scripts/staging-acceptance-fixture.mjs cleanup ${batchId}`);
  } catch (error) {
    try {
      const removed = await deleteBatch(admin, batchId);
      console.error(`Fixture setup failed; rolled back ${removed} temporary Auth users.`);
    } catch {
      console.error(`Fixture setup failed. Cleanup may be incomplete; retain batch ID ${batchId} for recovery.`);
    }
    throw error;
  }
}

async function cleanup(admin, rl, batchId) {
  if (!/^[0-9a-f-]{36}$/i.test(batchId ?? '')) {
    throw new Error('Supply the UUID batch ID printed by the prepare command.');
  }
  const users = await findBatchUsers(admin, batchId);
  if (!users.length) {
    console.log('No Auth users found for that acceptance batch; nothing changed.');
    return;
  }
  console.log(`This removes ${users.length} temporary Auth users from staging and cascades their profile data.`);
  await confirmStaging(rl, `DELETE ACCEPTANCE BATCH ${batchId}`);
  const removed = await deleteBatch(admin, batchId);
  console.log(`Deleted ${removed} temporary staging Auth users. Profile-owned data cascades; retained audit/outbox records are anonymized by their foreign-key policies.`);
}

async function main() {
  const [action, batchId] = process.argv.slice(2);
  if (!['prepare', 'cleanup'].includes(action)) {
    throw new Error('Usage: node scripts/staging-acceptance-fixture.mjs <prepare|cleanup> [batch-id]');
  }
  const admin = getClient();
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    if (action === 'prepare') await prepare(admin, rl);
    else await cleanup(admin, rl, batchId);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Staging acceptance fixture failed.');
  process.exitCode = 1;
});