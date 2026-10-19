import { execFileSync, spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

const script = 'scripts/staging-authz-probe.mjs';
const staging = { ...process.env, COMMONWORK_ENV: 'staging', SUPABASE_URL: 'https://jcpwiijzycjgsfvyeeyv.supabase.co', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_ANON_KEY: '' };

test('hosted probe defaults to a credential-free, network-free dry-run', () => {
  const output = execFileSync(process.execPath, [script], { env: staging, encoding: 'utf8' });
  expect(JSON.parse(output)).toMatchObject({ project: 'jcpwiijzycjgsfvyeeyv', mode: '--dry-run', writes: false, network: false, syntheticAccounts: 3 });
});

test('hosted probe refuses Production, other projects and missing live credentials', () => {
  for (const change of [
    { COMMONWORK_ENV: 'production' },
    { SUPABASE_URL: 'https://ydatgycmbcfzgythoppy.supabase.co' },
    { SUPABASE_URL: 'http://jcpwiijzycjgsfvyeeyv.supabase.co' },
  ]) {
    const result = spawnSync(process.execPath, [script, '--dry-run'], { env: { ...staging, ...change }, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
  }
  const missing = spawnSync(process.execPath, [script, '--run'], { env: staging, encoding: 'utf8' });
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toContain('credentials are required');
});
