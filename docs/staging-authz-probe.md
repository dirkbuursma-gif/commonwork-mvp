# Hosted staging authorization probe

Script: `scripts/staging-authz-probe.mjs`. Pinned project: `jcpwiijzycjgsfvyeeyv`. Do not use the older staging-acceptance-fixture script for this project; it targets a different project.

## Commit versus execution approval

Committing this runner does not authorize executing hosted writes. CI tests only the offline dry-run and rejection guards. There are no hosted credentials in CI. Wait for CI success and a separate explicit hosted-test decision before using --run.

Set COMMONWORK_ENV=staging and SUPABASE_URL=https://jcpwiijzycjgsfvyeeyv.supabase.co in a private terminal. `node scripts/staging-authz-probe.mjs --dry-run` requires no credentials and performs no network requests or writes.

A separately approved live run additionally requires SUPABASE_ANON_KEY (publishable or legacy anon) and SUPABASE_SERVICE_ROLE_KEY (server-only). Never paste either credential into chat, command arguments, repository files or logs. Run `node scripts/staging-authz-probe.mjs --run` and review its generated fixture addresses, project and batch before typing the displayed confirmation phrase.

## Exact live footprint

Three fictional @example.test Auth accounts are created with a trusted app_metadata batch marker. Only the synthetic manager receives workspace membership and an event-manager appointment. Its fictional discoverable profile, competence evidence and closed contact preferences provide positive controls; no contact channel is opted in. The probe creates one published synthetic event and one small plain-text object in the private event-materials bucket. It does not upload a real guide, read real member profiles, or modify existing accounts.

Sessions use admin-generated test tokens; no signup/invitation/OTP email is sent by the runner. Calls with user JWTs test non-member vocabulary/discovery and business-RPC denial, self-escalation refusal, minimal-profile attendance requests, real manager approval/revocation, private object downloads and the same attendee access token throughout. Synthetic manager membership is also revoked to check immediate database permission lookup.

This is not a public signup, SMTP, CAPTCHA, Preview-browser, full catalogue/matching, or pre-issued signed-URL expiry test. These remain separate acceptance checks.

## Cleanup and failure handling

Normal completion removes the private object, event, synthetic Auth accounts and profile-owned fixtures. Retained audit/activity records may be anonymized by FK behavior. Recovery manifests under supabase/.temp contain only synthetic addresses/IDs and batch scope, never passwords or tokens, and are mode 0600. Cleanup verifies the trusted Auth batch marker and address before deletion, and checks event ownership.

On failure, stop and retain the printed manifest. After reviewing it, use `node scripts/staging-authz-probe.mjs --cleanup <manifest-path>`; this requires a separate typed batch-specific confirmation. A timed-out create with no returned ID is an unresolved batch requiring investigation; do not claim complete cleanup or rerun blindly. No broad deletion or Auth-user listing is used.

After success, independently recheck aggregate Auth/membership counts and retained fixture residue. Signup remains disabled; no Auth/environment configuration, migration history, existing role, merge or Production change is part of this probe.
