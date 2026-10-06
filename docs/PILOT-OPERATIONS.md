# Pilot Operations

## Readiness boundary

Pilot Hardening adds local member sign-out, Connector administration, privacy controls and database-enforced usage limits. It does not configure or deploy hosted projects. No hosted Supabase or Vercel credentials are part of this repository. Do not use real member data until the staging and production gates below are complete.

This release does not add partner networks, events, newsletters, working groups, public discussions, email automation or other member-facing product areas.

The transactional outbox and Resend worker are implemented locally. DNS verification, provider secrets and hosted delivery tests are still pending. Supabase Auth SMTP is a separate configuration from application notification delivery.

## Local verification

Use Node.js 22.12 or newer. Run the local database reset before the application checks so the full migration chain is exercised:

```sh
npx supabase db reset
npm run check
npm run build
npx playwright test --workers=1
npm audit --omit=dev
```

The Playwright helper provisions disposable users through the local Supabase service-role API. It must not be pointed at a hosted project.

## Hosted project setup

Create separate Supabase projects for staging and production, and separate Vercel deployments/environments for each. Keep production data out of Preview deployments. Before applying migrations, review the pending migration list and take a provider-supported backup or snapshot.

For each Supabase project:

1. Set the Auth site URL to the exact deployment origin. Add only the exact sign-in callback and local development URLs required by that environment; remove placeholder localhost URLs from hosted settings.
2. Disable public sign-ups. Invite pilot members through the approved operator process, and configure and test Auth email delivery before inviting anyone.
3. Configure administrator MFA and least-privilege access. Restrict database/network access where supported by the selected plan and deployment architecture.
4. Link the CLI to the intended project and inspect its migration status before applying migrations:

   ```sh
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase migration list --linked
   npx supabase db push
   ```

   Confirm the project reference and backup before `db push`; it applies pending repository migrations to that linked database. Never use `db reset` against a hosted project.

For each Vercel environment, configure only these application variables:

| Variable | Value |
| --- | --- |
| `PUBLIC_SUPABASE_URL` | The matching environment's Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | That project's publishable/anon key |

The normal Astro SSR client uses the anon key with RLS. The notification dispatcher is the only application component that needs the service-role credential. Configure these additional variables as encrypted server-only Vercel environment variables, branch-scoped to `build/pilot-hardening` for Preview and with staging values only:

| Variable | Use |
| --- | --- |
| `SUPABASE_URL` | Staging project URL for the worker's privileged database client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only queue, Auth email lookup and delivery RPC access |
| `RESEND_API_KEY` | Resend send-email API credential |
| `RESEND_WEBHOOK_SECRET` | Resend webhook signature verification secret |
| `CRON_SECRET` | Bearer secret required by the dispatch endpoint |
| `APP_BASE_URL` | Exact staging Preview origin used to construct safe links |
| `EMAIL_FROM_ADDRESS` | Address on the Resend-verified sending domain |
| `EMAIL_FROM_NAME` | Sender display name, normally `Commonwork` |
| `SEED_EMAIL_MODE` | Set to `suppress` for staging/demo |

Never prefix secrets with `PUBLIC_`, expose the service-role key to browser code, or print credentials in logs. With `SEED_EMAIL_MODE=suppress`, the dispatcher suppresses every application email in that deployment. Independently, `@example.test` recipients are always suppressed even if the mode is unset. Suppressed records are not counted as sends or deliveries, and webhook events for suppressed records are ignored. Keep notification email separate from marketing/newsletter consent.

Vercel Cron runs on Production deployments, not Preview deployments. Do not deploy this cron to Production as part of staging setup. For Preview acceptance, trigger the secured dispatcher manually or use a staging-only scheduler; verify the `CRON_SECRET` bearer check remains enabled. Build with `npm run build`, deploy a Preview against staging, then run hosted acceptance before considering Production.

## Initial administrator and Connector CLI

An initial Commonwork administrator must be appointed after the invited operator has an Auth account and corresponding `profiles` row. This bootstrap is deliberately not self-service: an authorized database operator inserts that profile ID into `public.commonwork_administrators` using the Supabase SQL editor or another approved privileged process. Verify the account identity and UUID before granting the role; do not add a browser-facing bootstrap route.

For example, after verifying the UUID independently, run this statement in the intended project's SQL editor and confirm that it returns exactly that profile ID:

```sql
insert into public.commonwork_administrators (profile_id)
select id
from public.profiles
where id = '<verified-profile-uuid>'::uuid
on conflict (profile_id) do nothing
returning profile_id;
```

The Connector CLI runs from a trusted operator workstation. Provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as a pair, plus `COMMONWORK_ADMIN_PROFILE_ID` (or `COMMONWORK_ADMIN_EMAIL`) for an already active administrator. Set `COMMONWORK_ENV=staging` or `COMMONWORK_ENV=production` explicitly for hosted use. Do not save the service-role key in the repository or Vercel. Production Connector changes require both `--confirm-production` and typing the displayed production confirmation; `--yes` alone is not sufficient.

```sh
npm run connector:list
npm run connector:add -- member@example.com --capacity 2
npm run connector:remove -- member@example.com
```

Review Connector assignments and audit records after changes. Reassignment is limited to two changes per introduction. The CLI is the only supported Connector administration interface in this release.

The same operator credentials and environment rules apply to report and privacy commands. List commands show summaries; use `view` only when case details are needed. Status changes require a 3-2,000 character `--note`, are executed through active-administrator-only database functions, and are written to `commonwork_pilot_audit` in the same transaction.

```sh
npm run report:list
npm run report:view -- <report-id>
npm run report:review -- <report-id> --note "Identity and context reviewed"
npm run report:resolve -- <report-id> --note "Concern reviewed and addressed"
npm run report:dismiss -- <report-id> --note "Report reviewed; no action required"

npm run privacy:list
npm run privacy:view -- <request-id>
npm run privacy:review -- <request-id> --note "Identity verification is in progress"
npm run privacy:resolve -- <request-id> --note "Deletion completed under the approved retention process"
npm run privacy:reject -- <request-id> --note "Request could not be verified"
```

For any hosted target, set `COMMONWORK_ENV=staging` or `COMMONWORK_ENV=production`; the scripts refuse an unlabelled remote project. Production changes additionally require the displayed typed confirmation. Keep the service-role key on the operator workstation, not in Vercel.

## Privacy and support operations

- Members can download their own JSON export. A recorded export request is a separate, idempotent support request.
- Profile deactivation makes the profile private, removes competence discoverability and sets availability to unavailable. It does not delete the Auth account or erase records.
- Account deletion is a request, not automatic erasure. An authorized operator must verify the requester, review applicable retention obligations, complete the approved deletion process, and only then mark the request fulfilled with `privacy:resolve`. The CLI records status and audit history but does not delete or anonymize the Auth account. A generic receipt/status email is queued, without including the member's note.
- Requester and recipient members can submit an introduction report from the introduction page. The RPC restricts reports to those participants and RLS limits report reads to the author. Authorized operators can list, view, review, resolve or dismiss reports with the report CLI; each status change and operator note is audited. A generic receipt email is queued to the reporter; report details are never placed in email or webhook records. Assign a staffed review target before inviting pilot members.
- Members may block another member from future introductions. Existing consented introductions and contact snapshots are not retroactively withdrawn by this control.

Assign an accountable operator and response target for privacy requests and safety concerns before inviting pilot members. Do not promise a deletion timeline or support channel that has not been staffed and tested.

## Limits and monitoring

Database controls currently enforce at most five active, unexpired needs per member; five introduction requests per member per rolling seven days; ten match recalculations per member per rolling hour; and two Connector reassignments per introduction. Rate-limit events are retained only for their enforcement window, except reassignment records, which are retained for the configured 100-year window. These controls are not a substitute for abuse monitoring or support.

Application failures are emitted as structured server logs with whitelisted event names, action names, UUID identifiers and SQLSTATE codes. They intentionally omit request bodies, email addresses, contact values and raw database messages. Delivery rows retain only provider IDs, template version, status, safe failure codes and a short redacted summary. Webhooks retain event IDs/types and timestamps, never raw payloads or recipient addresses. Review hosting log access, retention and alerting before launch. No Sentry DSN or external monitoring integration is configured.

Choose a backup and retention policy appropriate to the Supabase plan and applicable obligations. Before production use, document who can restore a backup, restore a recent backup into an isolated project, verify application migrations and RLS after restore, and record the recovery result. Backup availability and restoration have not been verified by this repository's local tests.

## Staging acceptance gate

Before production approval, complete and record all of the following:

- Staging and production Supabase/Vercel projects are distinct; hosted Auth redirects, invite-only access and Supabase Auth sign-in/invite email delivery are verified.
- Resend domain and webhook signing secret are verified/configured; Supabase Auth SMTP is tested separately. Transactional templates, queue idempotency, retries, delivery status and signed webhook ingestion pass staging checks. Demo suppression is confirmed, including zero provider sends to `@example.test` accounts.
- All migrations are applied to staging; the full Playwright suite passes against the local Supabase stack; a separate hosted staging smoke pass covers two independently invited member accounts. Never point the local Playwright helper at hosted Supabase.
- Sign-out, profile visibility/deactivation, export, privacy request handling, block behavior, Connector assignment/revocation and quota boundaries are manually checked in the hosted environment.
- RLS, logs, administrator access, backup retention and a restore drill are reviewed by the responsible operators.
- The privacy-request and safety-reporting gaps above have an explicit, staffed manual process; members are told accurately what support is available.
- Production migration and rollback/restore plans are approved before any production data is created.

The demo seed schema/data is a separate follow-up. Seed migration `20261006100500_demo_seed_schema.sql` must not be pushed until the exact final seed roots, batch cleanup and read-only event schema are reviewed. Demo content must be visibly labelled and excluded from production analytics by default.

Until hosted projects and credentials are provisioned, hosted migrations, deployment, email delivery, backup restoration and hosted acceptance remain unverified prerequisites.