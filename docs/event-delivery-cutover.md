# Protected event delivery: bounded correction and operator runbook

Status: PREPARED PATCH, NOT A RELEASE. Do not enable participant access until every gate below passes. No hosted action is authorized by possession of this document.

## Baseline and scope

Repository: dirkbuursma-gif/commonwork-mvp. Review PR: 14. Target: feature/event-access-requests at a4fdc841bd0494e819bde8a06a1049aed02cd537. Prepared against the PR scaffold at 1ee3ecd01adec38e83f053a4ada918a098bd7b1c. The subsequent branch-only deployment guard is 5892841f1556e3770690f3ee070af16ca3e70ea9; application/tests/CI are ff1ba471a2dfb424d80abb68123711c0bd081f6b. Recheck the branch head before committing or deploying; stop on unrelated changes. A final reviewed head must include this probe and runbook commit as well.

The incident was a same-attendee-JWT, post-revocation Storage cache hit. Do not reinterpret it as a pre-approval failure, response-shape problem, or a cache-buster requirement.

The patch streams bytes through the application after verified SSR identity and fresh event authorization. It keeps the event bucket private and restricts direct authenticated Storage reads/signing to event managers. Manager uploads, updates, deletion and reads remain narrow management operations. Attendees, including approved attendees, must not download or sign directly. Metadata RLS and public.events grants are not broadened. Other buckets are unchanged.

No signup activation, account provisioning for participants, email sends, Production changes, merges, newsletters, affiliations, contact consent or workspace membership grants are included. Existing invitation shouldCreateUser:false and registration flags stay unchanged.

## Local validation before any hosted operation

Use Node 22.23.3 and the existing local Docker/Supabase test setup. Run:

    npm ci
    npm run check
    npm run build
    npm test
    git diff --check
    python3 scripts/scan-secrets.py --tracked
    python3 scripts/scan-secrets.py --bundles dist

The complete Playwright suite must pass, not only the new tests. PR CI adds the feature target and updates only the Node pin. Permissions, hosted secrets and deployment jobs do not change. The local web-server wrapper discards inherited service/secret keys and supplies only the SERVICE_ROLE_KEY returned by the freshly started, loopback-only local Supabase instance to the server process. No hosted keys belong in CI, fixtures or committed env files.

New tests cover same application URL/session approval warming and revocation for documents and allowlisted video, actual local manager uploads, direct Storage denial after approval, range responses, malformed paths, cross-origin mutations, role metadata spoofing, safe filenames, private/no-store headers, streaming without whole-body buffering and secret/header isolation. The video fixture is synthetic bytes, not a playable large media file; this does not prove hosted playback or platform streaming limits.

The review branch has automatic Git deployment disabled in vercel.json. Keep this guard while reviewing. A later explicitly approved Preview deployment must use the reviewed commit and the Preview-only settings below; do not silently re-enable automatic deployments or promote a deployment.

## Explicit staging approval and migration order

1. Obtain separate approval for staging migration/configuration/deployment. No automatic hosted step is authorized by this patch.
2. Confirm the pinned staging project jcpwiijzycjgsfvyeeyv is current through 20261019111000_staging_authz_fixture_cleanup. Do not touch Production.
3. Keep participant activation blocked. Apply the next tracked migration, 20261019130000_application_event_delivery.sql, to staging only. Deploying old redirect code against the new policy deliberately fails closed for attendee downloads; use a maintenance window, not a permissive policy workaround.
4. Add SUPABASE_SERVICE_ROLE_KEY as a private runtime variable for the exact staging Preview environment only. Never use a PUBLIC_ name or expose its value in shell history, logs, HTML or client bundles. The server also needs its existing PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY bound to the same staging project.
5. Deploy the reviewed commit to an explicitly identified Vercel Preview. Do not modify Production environment variables, registration flags, Auth settings or signup blocks. Independently verify Preview status, commit identity, project binding and protection before allowlisting the origin.
6. GET /api/events/material on Preview is a no-store configuration-presence preflight. It returns 401 plus delivery version/project headers only when server configuration shape is present. It neither reads Storage objects nor proves the secret actually authorizes Storage; invalid credentials still fail closed on delivery. Do not treat this as a full readiness proof.

## Legacy cached paths and previously issued URLs: mandatory cutover gate

The application proxy does not recall cached raw Storage URLs issued before cutover. The SQL migration alone does not prove that existing CDN responses disappeared. A query-string change proves nothing about the original warmed path.

Inventory every browser-exposed event-materials object path and signed URL still in use. Record issuance/expiry, object cache lifetime, the exact original raw/signed URL (store token-bearing URLs privately, never in the runbook or PR), and object references in material metadata and the two video allowlist paths.

For any path whose cache retirement cannot be demonstrated, prepare an explicitly approved operator relocation/removal plan: copy the object server-side to a new private path, update its trusted metadata or tracked video allowlist, retire the old object, wait for documented CDN invalidation and verify the ORIGINAL warmed URL returns no bytes. Do not modify hosted materials automatically or break the fixed event identity binding. Stop if organizer permission, inventory or safe transition evidence is incomplete.

Five-minute signed URL expiry must be verified on the original URL; it is not sufficient evidence for the separately observed authenticated-object cache path. Do not claim complete cutover until both signed URL and raw authenticated-path risks are closed. Already downloaded copies and already-started transfers cannot be recalled. Revocation blocks subsequent application requests, not bytes already received.

## One hosted synthetic acceptance command

Only after the above approval and gates, use an interactive operator terminal. Load secrets privately, not inline in a recorded command. Required environment names:

- COMMONWORK_ENV=staging
- SUPABASE_URL=https://jcpwiijzycjgsfvyeeyv.supabase.co
- SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY for that project
- COMMONWORK_PREVIEW_URL: the exact verified Preview origin, not a guessed deployment
- COMMONWORK_PREVIEW_ALLOWLIST: the same exact origin, or an explicit comma-separated allowlist
- COMMONWORK_PREVIEW_CONFIRMED=preview-staging after independently verifying deployment context
- COMMONWORK_VERCEL_PROTECTION_BYPASS, only if that Preview requires an explicitly approved private protection credential; this is sent only to the allowlisted Preview origin

Then run:

    node scripts/staging-authz-probe.mjs --run

The runner validates Preview configuration presence and the fixture-only cleanup RPC before creating accounts, then requires its exact interactive confirmation. It creates three tagged synthetic accounts, one synthetic event and one tiny text object. It sends no email. Approval and revocation use the synthetic manager JWT. It warms the identical application POST URL three times, then repeats it with the same attendee session after revocation. Direct attendee Storage download and signing must fail even while approved. Existing privacy/workspace-isolation checks remain. CI must never run this command.

Default --dry-run remains offline, network-free and credential-free with the existing pinned target environment. The runner does not test real signup, CAPTCHA, actual organizer-operated approval UI or large media playback. It does not bypass Vercel protection automatically or guess its credential.

## Cleanup and recovery

The runner verifies trusted app_metadata ownership and exact synthetic addresses before deletion. It uses manage_staging_authz_event, never broad public.events service-role grants. It verifies object listing no longer contains the exact fixture, the fixture event lookup is empty, and each tracked Auth ID returns 404. Pre-existing users are not modified. Do not rerun historical batch 73c485f4-9246-40b4-9d19-1507b0ce9a52.

If anything fails, retain the 0600 recovery manifest under the existing supabase/.temp fixture directory. Do not share its raw contents or tokens. Recover only that batch with:

    node scripts/staging-authz-probe.mjs --cleanup <exact-recovery-manifest>

Cleanup does not require the Preview to remain available. Unresolved in-flight account creation retains the manifest and blocks a false cleanup-success claim. A scoped operator review must resolve it before another run.

## Participant go/no-go

Remain NO-GO until: complete CI is green; staging migration and private runtime config are verified; tiny-fixture hosted acceptance and cleanup pass; original warmed legacy paths and pre-issued URL expiry are verified; and actual large-file/video playback, seeking, aborts, streaming memory/duration/size limits and no CDN caching are proven on the selected Preview platform.

Separately validate the real email/CAPTCHA registration journey, redirect binding and organizer approval UI under explicit approval. Account creation and event approval must not grant professional discoverability, workspace access, affiliations or commercial-contact consent. Registration activation or real participant provisioning requires a separate decision. If the platform buffers media or cannot support the required file sizes/ranges, report NO-GO and the measured limitation; do not introduce an unapproved service.
