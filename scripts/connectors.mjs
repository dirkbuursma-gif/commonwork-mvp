#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2).filter((value) => value !== '--');
const [command, ...commandArgs] = args;
const targetEmail = command === 'list' ? null : commandArgs.find((value) => !value.startsWith('--'));
const flags = commandArgs.filter((value) => value.startsWith('--'));
const commandMap = {
  add: 'assign',
  remove: 'revoke',
};
const supportedCommands = new Set(['add', 'remove', 'list']);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseEnv(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!/^[A-Z_]+$/.test(key)) continue;
    values[key] = rawValue.startsWith('"') ? JSON.parse(rawValue) : rawValue;
  }
  return values;
}

function localConfig() {
  try {
    return parseEnv(execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    fail('Supabase CLI credentials are unavailable. Set server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
}

function projectConfig() {
  const configuredUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const configuredKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (Boolean(configuredUrl) !== Boolean(configuredKey)) {
    fail('Set both SUPABASE_URL and server-only SUPABASE_SERVICE_ROLE_KEY, or use a running local Supabase project.');
  }

  const config = configuredUrl && configuredKey
    ? { API_URL: configuredUrl, SERVICE_ROLE_KEY: configuredKey }
    : localConfig();
  if (!config.API_URL || !config.SERVICE_ROLE_KEY) {
    fail('Supabase URL and service-role credential are required.');
  }

  const host = new URL(config.API_URL).hostname;
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
  const declaredEnvironment = process.env.COMMONWORK_ENV;
  const environment = declaredEnvironment === 'production'
    ? 'production'
    : isLocal
      ? 'local'
      : declaredEnvironment === 'staging'
        ? 'staging'
        : 'production';
  return { url: config.API_URL, serviceRoleKey: config.SERVICE_ROLE_KEY, environment };
}

async function findUserId(admin, email) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) fail('Provide a valid member email address.');

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail('Could not look up the member in Supabase Auth.');
    const match = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (match) return match.id;
    if (data.users.length < 1000) break;
  }
  fail('No authenticated member was found for that email.');
}

async function findActorId(admin) {
  if (process.env.COMMONWORK_ADMIN_PROFILE_ID) return process.env.COMMONWORK_ADMIN_PROFILE_ID;
  if (process.env.COMMONWORK_ADMIN_EMAIL) return findUserId(admin, process.env.COMMONWORK_ADMIN_EMAIL);
  fail('Set COMMONWORK_ADMIN_PROFILE_ID or COMMONWORK_ADMIN_EMAIL for an account already provisioned as an administrator.');
}

async function confirmAction(environment, commandName, subject, confirmProduction) {
  if (environment === 'production' && !confirmProduction) {
    fail('Refusing a production Connector change. Add --confirm-production to continue.');
  }
  if (environment !== 'production' && flags.includes('--yes')) return;
  if (!stdin.isTTY) fail('Connector changes require interactive confirmation.');

  const readline = createInterface({ input: stdin, output: stdout });
  const expected = environment === 'production'
    ? `CONFIRM PRODUCTION ${commandName.toUpperCase()} ${subject}`
    : 'yes';
  try {
    const answer = (await readline.question(
      environment === 'production'
        ? `Type "${expected}" to confirm: `
        : `Confirm ${commandName} Connector ${subject} in ${environment}? Type "yes": `,
    )).trim();
    if (answer !== expected) fail('Connector action cancelled.');
  } finally {
    readline.close();
  }
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npm run connector:add -- <email> [--capacity <1-100>] [--yes] [--confirm-production]');
    console.log('       npm run connector:list [--yes] [--confirm-production]');
    console.log('       npm run connector:remove -- <email> [--yes] [--confirm-production]');
    return;
  }
  if (!supportedCommands.has(command)) fail('Use connector:add, connector:list or connector:remove.');
  if (command !== 'list' && !targetEmail) fail('Provide the target member email.');

  const config = projectConfig();
  const admin = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const actorProfileId = await findActorId(admin);
  const { data: actor, error: actorError } = await admin
    .from('commonwork_administrators')
    .select('profile_id')
    .eq('profile_id', actorProfileId)
    .eq('status', 'active')
    .maybeSingle();
  if (actorError || !actor) fail('The configured operator is not an active Commonwork administrator.');

  const confirmProduction = flags.includes('--confirm-production');
  if (command === 'list') {
    await confirmAction(config.environment, 'list', 'all connectors', confirmProduction);
    const { data, error } = await admin.rpc('list_commonwork_connectors', {
      actor_profile_id: actorProfileId,
    });
    if (error) fail(`Could not list Connector assignments (${error.code ?? 'database_error'}: ${error.message}).`);
    for (const connector of data ?? []) {
      console.log(`${connector.profile_id}\t${connector.display_name}\t${connector.status}\tcapacity=${connector.introduction_capacity}`);
    }
    return;
  }

  const targetProfileId = await findUserId(admin, targetEmail);
  const action = commandMap[command];
  const capacityFlag = commandArgs.indexOf('--capacity');
  const capacity = capacityFlag >= 0 ? Number(commandArgs[capacityFlag + 1]) : 2;
  if (action === 'assign' && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100)) {
    fail('Capacity must be an integer between 1 and 100.');
  }
  await confirmAction(config.environment, command, targetEmail.trim().toLowerCase(), confirmProduction);

  const { data, error } = await admin.rpc('manage_commonwork_connector', {
    target_profile_id: targetProfileId,
    target_action: action,
    target_introduction_capacity: action === 'assign' ? capacity : null,
    actor_profile_id: actorProfileId,
  });
  if (error) fail(`The Connector change was rejected (${error.code ?? 'database_error'}: ${error.message}).`);
  if (!data?.length) fail('The Connector change was rejected (no Connector record returned).');
  const connector = data[0];
  console.log(`${command === 'add' ? 'Assigned' : 'Revoked'} Connector ${connector.display_name}; status=${connector.status}; capacity=${connector.introduction_capacity}.`);
}

main().catch(() => fail('Connector administration failed. No credentials or tokens were printed.'));
