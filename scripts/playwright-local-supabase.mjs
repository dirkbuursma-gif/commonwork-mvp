#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const setupDeadline = Date.now() + 210_000;

function runSupabase(args, label, timeout = Math.max(1, setupDeadline - Date.now())) {
  const result = spawnSync('npx', ['supabase', ...args], {
    cwd,
    stdio: 'inherit',
    timeout,
  });
  if (result.error || result.status !== 0) {
    const reason = result.error ? result.error.name : `exit code ${result.status ?? 'unknown'}`;
    console.error(`Local Supabase ${label} failed (${reason}).`);
    return false;
  }
  return true;
}

function stopSupabase() {
  return runSupabase(['stop'], 'shutdown', 60_000);
}

if (!runSupabase(['start'], 'startup')) {
  stopSupabase();
  process.exit(1);
}
if (!runSupabase(['db', 'reset'], 'database reset')) {
  stopSupabase();
  process.exit(1);
}

let status;
try {
  status = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    cwd,
    encoding: 'utf8',
    timeout: Math.max(1, setupDeadline - Date.now()),
  });
} catch (error) {
  console.error(`Local Supabase status failed (${error.name}).`);
  stopSupabase();
  process.exit(1);
}
const values = {};
for (const line of status.split(/\r?\n/)) {
  const separator = line.indexOf('=');
  if (separator < 1) continue;
  const key = line.slice(0, separator).trim();
  const rawValue = line.slice(separator + 1).trim();
  if (key === 'API_URL' || key === 'ANON_KEY' || key === 'SERVICE_ROLE_KEY') {
    values[key] = rawValue.startsWith('"') ? JSON.parse(rawValue) : rawValue;
  }
}

if (!values.API_URL || !values.ANON_KEY || !values.SERVICE_ROLE_KEY || !/^http:\/\/(127\.0\.0\.1|localhost):[0-9]+\/?$/.test(values.API_URL)) {
  console.error('Local Supabase status did not provide loopback-only generated credentials.');
  stopSupabase();
  process.exit(1);
}

const serverEnv = { ...process.env };
for (const key of Object.keys(serverEnv)) {
  if (/SERVICE_ROLE|SECRET_KEY/i.test(key)) delete serverEnv[key];
}
// Only the freshly generated local key crosses this boundary; inherited hosted keys were removed above.
serverEnv.SUPABASE_SERVICE_ROLE_KEY = values.SERVICE_ROLE_KEY;
serverEnv.COMMONWORK_VIDEO_SECRET_KEY = values.SERVICE_ROLE_KEY;
serverEnv.PUBLIC_SUPABASE_URL = values.API_URL;
serverEnv.PUBLIC_SUPABASE_ANON_KEY = values.ANON_KEY;
serverEnv.CRON_SECRET = 'local-test-cron-secret';
serverEnv.RESEND_API_KEY = 're_local_test_only';
serverEnv.RESEND_WEBHOOK_SECRET = 'whsec_bG9jYWwtdGVzdC13ZWJob29rLXNlY3JldA==';

const server = spawn('npx', ['astro', 'dev', '--ignore-lock', '--host', '127.0.0.1', '--port', '4322'], {
  cwd,
  env: serverEnv,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}

server.on('error', (error) => {
  console.error('Could not start the Astro test server:', error.message);
  process.exit(stopSupabase() ? 1 : 2);
});
server.on('exit', (code, signal) => {
  const exitCode = code ?? (signal ? 1 : 0);
  process.exit(stopSupabase() ? exitCode : 1);
});
