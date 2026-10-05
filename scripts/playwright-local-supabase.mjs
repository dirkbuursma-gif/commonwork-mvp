#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const start = spawnSync('npx', ['supabase', 'start'], { cwd, stdio: 'ignore' });
if (start.status !== 0) {
  console.error(`Local Supabase startup failed with exit code ${start.status ?? 'unknown'}.`);
  process.exit(start.status ?? 1);
}

const status = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
  cwd,
  encoding: 'utf8',
});
const values = {};
for (const line of status.split(/\r?\n/)) {
  const separator = line.indexOf('=');
  if (separator < 1) continue;
  const key = line.slice(0, separator).trim();
  const rawValue = line.slice(separator + 1).trim();
  if (key === 'API_URL' || key === 'ANON_KEY') {
    values[key] = rawValue.startsWith('"') ? JSON.parse(rawValue) : rawValue;
  }
}

if (!values.API_URL || !values.ANON_KEY) {
  console.error('Local Supabase status did not provide its URL and anon key.');
  process.exit(1);
}

const serverEnv = { ...process.env };
for (const key of Object.keys(serverEnv)) {
  if (/SERVICE_ROLE|SECRET_KEY/i.test(key)) delete serverEnv[key];
}
serverEnv.PUBLIC_SUPABASE_URL = values.API_URL;
serverEnv.PUBLIC_SUPABASE_ANON_KEY = values.ANON_KEY;

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
  process.exit(1);
});
server.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
