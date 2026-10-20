# Isolated video delivery credential

The event video endpoint uses only COMMONWORK_VIDEO_SECRET_KEY with PUBLIC_SUPABASE_URL. It does not fall back to SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY. The existing document/material endpoint and shared default configuration reader are unchanged and continue using SUPABASE_SERVICE_ROLE_KEY. Authentication, email verification, attendee approval, private bucket access, object paths and range streaming are unchanged.

## Preview setup

1. In Vercel project commonwork-mvp, add COMMONWORK_VIDEO_SECRET_KEY as a server-only secret for Preview. Scope it to the actual Git branch being deployed (the existing fix branch for this patch). Do not prefix it with PUBLIC_ or NEXT_PUBLIC_.
2. Copy the server-side secret from Supabase commonwork-staging-eu, reference jcpwiijzycjgsfvyeeyv. Confirm PUBLIC_SUPABASE_URL targets that project. Do not use a secret from the integration project xnuwtcvwznaxxbvuwgxz merely because it is linked. Modern sb_secret_ values do not expose a project claim; local acceptance is not proof of successful Storage access.
3. Create a fresh Preview from that branch after saving. Confirm the deployment contains this patch; do not redeploy main for this test. Do not promote to Production until tested and separately configured.
4. Sign in as an approved attendee and play Geoffy. Look for configuration-accepted with credentialVariable COMMONWORK_VIDEO_SECRET_KEY, then storage-response and delivery-complete. Playback/seek normally uses 206; a full-object request uses 200.
5. If the new variable is absent, the endpoint fails closed and diagnostics identify missing. Existing legacy/integration keys are never used as fallback. Never share keys or unredacted env files.

## Validation

Regression coverage is in tests/event-video-credential-isolation.spec.ts. The source-boundary assertions check that the runtime reader has no old-variable fallback; they are not a live Vercel precedence test. Run npm run check, npm run build and npm test -- tests/event-video-credential-isolation.spec.ts tests/event-object-delivery.spec.ts tests/event-video-boundaries.spec.ts in the configured project environment. These checks must be executed before claiming they pass.

Do not remove existing integration variables, change bucket visibility, re-upload videos or alter registration as part of this patch.
