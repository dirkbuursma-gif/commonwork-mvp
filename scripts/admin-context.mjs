import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

export function fail(message) {
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
  if (declaredEnvironment && !['local', 'staging', 'production'].includes(declaredEnvironment)) {
    fail('COMMONWORK_ENV must be local, staging or production.');
  }
  if (!isLocal && !['staging', 'production'].includes(declaredEnvironment)) {
    fail('Set COMMONWORK_ENV explicitly to staging or production for a hosted project.');
  }

  const environment = declaredEnvironment ?? 'local';
  return { url: config.API_URL, serviceRoleKey: config.SERVICE_ROLE_KEY, environment };
}

export async function findUserId(admin, email) {
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

export async function createAdminContext() {
  const config = projectConfig();
  const admin = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let actorProfileId = process.env.COMMONWORK_ADMIN_PROFILE_ID;
  if (!actorProfileId && process.env.COMMONWORK_ADMIN_EMAIL) {
    actorProfileId = await findUserId(admin, process.env.COMMONWORK_ADMIN_EMAIL);
  }
  if (!actorProfileId) fail('Set COMMONWORK_ADMIN_PROFILE_ID or COMMONWORK_ADMIN_EMAIL for an account already provisioned as an administrator.');

  const { data: actor, error } = await admin
    .from('commonwork_administrators')
    .select('profile_id')
    .eq('profile_id', actorProfileId)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !actor) fail('The configured operator is not an active Commonwork administrator.');

  return { admin, actorProfileId, environment: config.environment };
}

export async function confirmAction(environment, command, subject, flags) {
  if (environment === 'production' && !flags.includes('--confirm-production')) {
    fail('Refusing a production action. Add --confirm-production to continue.');
  }
  if (environment !== 'production' && flags.includes('--yes')) return;
  if (!stdin.isTTY) fail('Administrative changes require interactive confirmation.');

  const readline = createInterface({ input: stdin, output: stdout });
  const expected = environment === 'production'
    ? `CONFIRM PRODUCTION ${command.toUpperCase()} ${subject}`
    : 'yes';
  try {
    const answer = (await readline.question(
      environment === 'production'
        ? `Type "${expected}" to confirm: `
        : `Confirm ${command} for ${subject} in ${environment}? Type "yes": `,
    )).trim();
    if (answer !== expected) fail('Administrative action cancelled.');
  } finally {
    readline.close();
  }
}