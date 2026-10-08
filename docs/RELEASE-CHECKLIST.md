# Release checklist

Use this sequence for a server-side secret update or rotation. Never include a
credential value in a pull request, issue, build log, screenshot, or release
record.

## Staging credential update

- [ ] Confirm the intended staging Vercel project/environment and matching
      staging Supabase project using non-secret project metadata.
- [ ] Add or update the required secret in the staging server environment only.
      Confirm it is not configured for Preview or Production.
- [ ] Trigger a **new staging deployment** after the environment change. An
      environment-variable edit does not update an already-running Vercel
      deployment.
- [ ] Confirm that the new deployment completed successfully and is serving the
      intended staging commit.
- [ ] Run a constrained server-only staging operation and verify success from
      status/record metadata only. Do not print request headers or credentials.
- [ ] Verify the client build and public runtime configuration contain no
      secret/service-role credential.
- [ ] Confirm the replacement deployment is healthy and using the new
      credential before revoking the previous credential.
- [ ] Revoke or otherwise invalidate the previous credential, then verify it
      can no longer authenticate without printing either value.
- [ ] Record environment name, deployment ID/commit, operation result, and
      revocation confirmation. Do not record secret values or prefixes.

## Production promotion

- [ ] Complete staging acceptance and obtain the required review.
- [ ] Confirm production Supabase/Vercel separation and approved migration
      backup/restore plan.
- [ ] Deploy with production-only credentials from the protected production
      branch; never promote a staging secret.
- [ ] Run post-deployment smoke checks and preserve evidence without
      credential-bearing logs.

## Local release evidence

The repository can check source, tests, builds, and generated bundles. Vercel
deployment state, project/environment scoping, Supabase revocation, and live
staging operations require evidence from those control planes.
