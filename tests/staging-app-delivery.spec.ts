import { spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
const origin = 'https://operator-selected-preview.vercel.app';
const valid = { COMMONWORK_PREVIEW_URL: origin, COMMONWORK_PREVIEW_ALLOWLIST: origin, COMMONWORK_PREVIEW_CONFIRMED: 'preview-staging', CI: '' };
function run(env: Record<string, string>, body = 'previewTarget(env);') {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `import { previewTarget, applicationDelivery } from './scripts/staging-app-delivery.mjs'; const env=${JSON.stringify(env)}; try { ${body} } catch { process.exitCode=1; }`], { encoding: 'utf8' });
}
test('Preview acceptance requires explicit origin, allowlist, Preview binding assertion and no CI', () => {
  expect(run(valid).status).toBe(0);
  for (const change of [{ COMMONWORK_PREVIEW_URL: '' }, { COMMONWORK_PREVIEW_ALLOWLIST: '' }, { COMMONWORK_PREVIEW_CONFIRMED: '' }, { COMMONWORK_PREVIEW_URL: 'https://commonwork.network' }, { COMMONWORK_PREVIEW_URL: `${origin}/path` }, { COMMONWORK_PREVIEW_URL: 'http://operator-selected-preview.vercel.app' }, { CI: 'true' }]) {
    expect(run({ ...valid, ...change }).status).not.toBe(0);
  }
});
test('blocked Preview or missing app delivery config fails preflight without fixture creation', () => {
  for (const status of [200, 302, 401, 403, 404, 503]) {
    const result = run(valid, `globalThis.fetch=async () => new Response(null,{status:${status}}); await applicationDelivery(env).preflight();`);
    expect(result.status).not.toBe(0);
  }
});
