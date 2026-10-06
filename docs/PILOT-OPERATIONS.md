# Pilot Operations

## Readiness boundary

Pilot Hardening adds local member sign-out, Connector administration, privacy controls and database-enforced usage limits. It does not configure or deploy hosted projects. No hosted Supabase or Vercel credentials are part of this repository. Do not use real member data until the staging and production gates below are complete.

This release does not add partner networks, events, newsletters, working groups, public discussions, email automation or other member-facing product areas.

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

The Supabase server client uses the anon key with RLS. Never put a service-role key in Vercel application variables, a `PUBLIC_` variable, source control, build output or browser code. Build with `npm run build`, deploy a Preview against staging first, then run the staging acceptance checks before considering a production deployment.

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

## Privacy and support operations

- Members can download their own JSON export. A recorded export request is a separate, idempotent support request.
- Profile deactivation makes the profile private, removes competence discoverability and sets availability to unavailable. It does not delete the Auth account or erase records.
- Account deletion is a request, not automatic erasure. An authorized operator must verify the requester, review applicable retention obligations, complete the approved deletion process, and record the resolution. The repository has no privacy-request administration UI or automated deletion job.
- Requester and recipient members can submit an introduction report from the introduction page; the RPC restricts reports to those participants and RLS limits report reads to the author. Operator list/view/resolve/dismiss tooling and audited report-status changes are not implemented. Establish an authorized, out-of-band review process before accepting reports from pilot members.
- Members may block another member from future introductions. Existing consented introductions and contact snapshots are not retroactively withdrawn by this control.

Assign an accountable operator and response target for privacy requests and safety concerns before inviting pilot members. Do not promise a deletion timeline or support channel that has not been staffed and tested.

## Limits and monitoring

Database controls currently enforce at most five active, unexpired needs per member; five introduction requests per member per rolling seven days; ten match recalculations per member per rolling hour; and two Connector reassignments per introduction. Rate-limit events are retained only for their enforcement window, except reassignment records, which are retained for the configured 100-year window. These controls are not a substitute for abuse monitoring or support.

Application failures are emitted as structured server logs with whitelisted event names, action names, UUID identifiers and SQLSTATE codes. They intentionally omit request bodies, email addresses, contact values and raw database messages. Review the hosting platform's log access, retention and alerting configuration before launch. No Sentry DSN or external monitoring integration is configured in this repository.

Choose a backup and retention policy appropriate to the Supabase plan and applicable obligations. Before production use, document who can restore a backup, restore a recent backup into an isolated project, verify application migrations and RLS after restore, and record the recovery result. Backup availability and restoration have not been verified by this repository's local tests.

## Staging acceptance gate

Before production approval, complete and record all of the following:

- Staging and production Supabase/Vercel projects are distinct; hosted Auth redirects, invite-only access and email delivery are verified.
- All migrations are applied to staging; the full Playwright suite passes against the local Supabase stack; a separate hosted staging smoke pass covers two independently invited member accounts. Never point the local Playwright helper at hosted Supabase.
- Sign-out, profile visibility/deactivation, export, privacy request handling, block behavior, Connector assignment/revocation and quota boundaries are manually checked in the hosted environment.
- RLS, logs, administrator access, backup retention and a restore drill are reviewed by the responsible operators.
- The privacy-request and safety-reporting gaps above have an explicit, staffed manual process; members are told accurately what support is available.
- Production migration and rollback/restore plans are approved before any production data is created.

Until hosted projects and credentials are provisioned, hosted migrations, deployment, email delivery, backup restoration and hosted acceptance remain unverified prerequisites.