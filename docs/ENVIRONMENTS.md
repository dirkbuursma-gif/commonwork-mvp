# Environment and credential inventory

This file records repository configuration and a proposed ownership model. It
does not assert that Vercel or Supabase projects are configured as described;
verify those settings in their control planes before activation.

## Environment matrix

| Environment | Supabase | Vercel | Credential rule |
| --- | --- | --- | --- |
| Local | Supabase CLI/local stack, or an explicitly designated development project | Local Astro server | Use local/development-only credentials. Never use staging or production service-role credentials. |
| Preview | Isolated development data or mocks; no production data | Pull-request Preview | Default to no service-role credential. If a privileged integration must be exercised, use an isolated disposable backend and credential. |
| Staging | Dedicated staging project | Protected staging/release deployment | Staging-only server secrets. Preview deployments must not inherit staging secrets by default. |
| Production | Separate production project | Protected production deployment | Production-only credentials, isolated from Local, Preview, and Staging. |

The repository has a local Supabase CLI configuration and migration history.
The presence of those files does not prove that hosted Development, Staging, or
Production projects exist or are distinct.

The Commonwork Playwright webServer wrapper owns local Supabase startup,
database reset, and shutdown for `npm test`. This resets the configured local
database before tests and stops that local stack afterward; do not point it at
a shared or hosted project.

## Variable inventory

### Public/client-safe

| Name | Purpose |
| --- | --- |
| `PUBLIC_SUPABASE_URL` | Supabase API URL used by browser and SSR clients. |
| `PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon credential used with RLS. Never replace it with a service-role/secret key. |

### Server-only, non-secret configuration

| Name | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase URL for privileged notification access; require this explicitly in hosted environments. |
| `APP_BASE_URL` | Application origin used in transactional links. |
| `EMAIL_FROM_ADDRESS` | Configured sender address. |
| `EMAIL_FROM_NAME` | Sender display name. |
| `SEED_EMAIL_MODE` | Suppresses notification delivery for seed/demo environments when set to `suppress`. |
| `COMMONWORK_ENV` | Operator CLI environment guard (`local`, `staging`, or `production`). |
| `COMMONWORK_ADMIN_PROFILE_ID` | Operator CLI actor identifier. |
| `COMMONWORK_ADMIN_EMAIL` | Alternative operator CLI actor lookup input; handle as personal data. |
| `PLAYWRIGHT_REUSE_TEST_SERVER` | Local Playwright test-server reuse switch. |

The last three are consumed by operator/test scripts and are not present in the
application `.env.example`.

### Sensitive server-side secrets

| Name | Purpose |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Notification worker database RPCs and Supabase Auth Admin lookup; bypasses RLS. Also consumed by local-only acceptance/operator scripts. |
| `RESEND_API_KEY` | Sends transactional email. |
| `RESEND_WEBHOOK_SECRET` | Verifies Resend webhook signatures. |
| `CRON_SECRET` | Authorizes notification dispatch requests. |

Never set these under a `PUBLIC_*` name or expose them to client bundles. The
operator and fixture scripts should receive only a local or explicitly scoped
staging credential when run.

## Privileged access and ownership

- Member-facing browser and SSR Supabase clients use the publishable/anon key
  and RLS.
- The notification dispatcher and Resend webhook use
  `SUPABASE_SERVICE_ROLE_KEY` through
  `src/lib/notifications/email.ts`. The migrations grant outbox RPC access to
  `service_role`; recipient lookup uses Supabase Auth Admin. Keep these secrets
  out of ordinary Preview deployments.
- `scripts/admin-context.mjs` and
  `scripts/staging-acceptance-fixture.mjs` use privileged access for operator
  workflows and temporary Auth fixture users. Keep credentials in a controlled
  local/staging execution context, never in browser code.
- Commonwork owns its schema and migrations, including the audience tables
  consumed by Commerce Partners. Commerce Partners is a client of this
  acquisition data interface, not the owner of those migrations.

## Credential naming migration map

| Current name | Proposed name | Migration note |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | `COMMONWORK_SUPABASE_SECRET_KEY` | Rename only after confirming the Supabase key type and updating all worker/operator consumers in a coordinated release. Do not change the credential value as part of a naming-only change. |
| `SUPABASE_URL` | `COMMONWORK_SUPABASE_URL` | Clarify ownership when separating integrations. Retain a temporary compatibility path only if needed for a staged rollout. |
| `PUBLIC_SUPABASE_ANON_KEY` | `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Optional naming alignment after confirming the installed Supabase SDK and selected key type support it. |

These are proposed names, not current aliases. Do not configure both old and
new names with different values.

## Verified locally / unknown

- **Verified locally:** the repository contains local Supabase configuration,
  migrations, server notification routes, and the listed variable references.
- **Unknown:** hosted Supabase project count/refs, environment values and
  scopes, Vercel environment/branch mappings, branch protections, and whether
  any deployment currently holds these secrets.
- The proposed CI scan recognizes common credential formats and populated
  secret-named assignments without printing values. Use
  `python3 scripts/scan-secrets.py --tracked` for tracked working-tree files,
  `python3 scripts/scan-secrets.py --bundles dist` for generated bundles, or
  `python3 scripts/scan-secrets.py --history` for all reachable Git blobs.
  Exit code `0` means complete with no findings, `1` means complete with
  findings, and `2` means the scan was incomplete or encountered unreadable
  input. Output includes scanned, skipped, unreadable, and finding counts;
  unreadable paths are named without file contents. In history mode, skipped
  counts are non-blob Git objects; blobs larger than 64 MiB fail the scan.
  History scanning has a five-minute timeout and fixed-size object batches.
  The scan is not a substitute for enabling GitHub secret
  scanning and push protection where available. Dependency auditing is a
  non-blocking CI report until the repository's baseline findings are assessed.
