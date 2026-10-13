# Commonwork V1 integration manifest

This manifest records the isolated candidate's source batches, file scope,
composition decisions and validation. It is not authorization to merge, apply
hosted migrations, configure credentials or deploy.

## Baseline

- Worktree: `/Users/d.o.buursma/Documents/commonwork-v1-integration`
- Branch: `feature/commonwork-v1-integration`
- Commit: `294a054b2d0bd94633ad2f32a9aad2ea6056572b`
- Remote check: `origin/build/pilot-hardening` resolved to the same SHA via `git ls-remote`; the earlier targeted fetch failed to resolve the remote ref, so no later commit was composed into this candidate.
- The catalogue correction is committed separately from the remaining integration batch. The branch is intended for one review PR to `build/pilot-hardening`; it has not been merged, deployed or applied to a hosted database.

## Batches

| Batch | Source | Files |
|---|---|---|
| Catalogue correction | `feature/geoffy-vtex-seed` at `f808e038c441b765cec399ff6784f8bafc888982` in `/Users/d.o.buursma/Documents/commonwork-mvp`; correction from the session catalogue review artifact | `supabase/seed.sql`, `tests/provider-onboarding.spec.ts`, `docs/DATA-MODEL.md`, `docs/HANDOFF.md` |
| Support contact | `feature/support-contact` in `/Users/d.o.buursma/Documents/commonwork-support-contact` | `src/components/app/SupportContact.astro`, `src/layouts/AppLayout.astro`, `src/layouts/AuthLayout.astro`, `tests/foundation.spec.ts` |
| CV-assisted onboarding | `feature/cv-assisted-onboarding` in `/Users/d.o.buursma/Documents/commonwork-cv-assisted-onboarding` | `package.json`, `package-lock.json`, `src/pages/onboarding.astro`, `src/components/app/CvImport.astro`, `src/lib/cv-suggestions.ts`, `src/lib/pdf-extraction.ts`, `src/workers/cv-extraction.worker.ts`, `tests/cv-assisted-onboarding.spec.ts`, `tests/helpers/cv-fixtures.ts` |
| Geography | `feature/profile-geography` baseline plus local implementation in this candidate | `src/lib/country-codes.ts`, `src/pages/api/onboarding.ts`, `src/pages/onboarding.astro`, `supabase/migrations/20261012100000_profile_geography.sql`, `tests/profile-geography.spec.ts`, `tests/competence-needs.spec.ts`, `tests/helpers/local-supabase.ts`, `docs/DATA-MODEL.md` |
| Approved vocabulary | Local integration implementation; CV files shared with CV batch | `src/lib/competence-data.ts`, `supabase/migrations/20261012100100_cv_vocabulary_additions.sql`, `src/lib/cv-suggestions.ts`, `tests/cv-assisted-onboarding.spec.ts` |

## Composition notes

- The candidate started from the verified pilot-hardening SHA, not `main`.
- Catalogue, support and CV tracked changes applied without conflicts. New support/CV files were copied from their respective feature worktrees.
- Geography was added to the CV branch's shared onboarding form and endpoint; manual profile fields and CV privacy behavior remain in place.
- Geography migration follows the baseline's latest migration (`20261009120000_provider_type.sql`). Vocabulary is in a separate later migration.
- The geography migration extends, rather than reorders, the existing discoverable view columns. It recreates `get_my_profile()` without `CASCADE` and restores authenticated execution.
- The shared onboarding overlap was resolved by combining CV import and member-entered geography in the same form/API route; manual profile entry and CV privacy controls remain intact.
- No cross-batch merge conflicts required choosing between competing behavior. The documented overlap files (`src/pages/onboarding.astro`, `src/lib/cv-suggestions.ts`, and `docs/DATA-MODEL.md`) contain the combined changes.
- CV dependencies retain the previously approved exact pins and root override; `package-lock.json` is included.
- The catalogue artifact contains the complete four-file patch, including `docs/HANDOFF.md`. Do not treat this integration composition as approval to commit or open a PR.

## Remaining validation

Hosted acceptance and owner authorization remain outside this local candidate. The catalogue and integrated patches have now been reviewed locally; no confirmed release-blocking code defect was found.

## Validation

- Clean migration replay and representative pre-geography profile upgrade: passed. Existing profile values remained unchanged, new fields defaulted to `NULL`/`[]`, discoverable-view column order/types were preserved, and authenticated-only RPC grants remained.
- Geography validation, direct-write constraints, RLS/anonymous denial, member visibility, and geography-independent match ranking: passed in the disposable database tests.
- `npm run check`: passed with Node 22.23.3 (83 Astro files, 0 errors, 0 warnings, 0 hints).
- `npm run build`: passed with Node 22.23.3.
- Full Playwright suite: 48/48 passed (4.4 minutes), including onboarding, CV, support, geography/RLS/ranking, needs/matching/introduction, privacy, provider catalogue exclusions and keyboard flows. The final FTE-boundary assertion was added afterward and its focused synthetic-CV test passed (1/1).
- Cold-worker follow-up: the first full test run had one DOCX-worker startup timeout. The browser tests use Astro's Vite development server; Vite generated its local optimized-dependency cache during that run, and later dev-server runs reused that cache. No source or application configuration changed to warm it, and the 25-second assertion timeout was not changed during this follow-up. This temporal association does not establish the cache as the timeout's cause.
- Production-built cold-browser smoke: passed in a fresh Playwright browser context against the generated `dist/client` importer bundle and DOCX worker, served with `no-store` caching. It extracted a synthetic DOCX, displayed one reviewed suggestion, selected it, cleared transient content, and made no outbound requests. The Vercel adapter does not support `astro preview`, so this smoke validates the built client assets, not the server-rendered production route or Vercel runtime; that remains for staging acceptance.
- `npm audit --package-lock-only`: 0 vulnerabilities. `npm ls argparse --all --package-lock-only` confirmed `argparse@3.0.2` resolves for Mammoth and Astro's `js-yaml`; exact dependency pins and override are recorded in `package.json` and `package-lock.json`.
- Built CV asset sizes (raw / Brotli): importer component 9,683 / 3,247 bytes; DOCX worker 311,806 / 80,564 bytes; PDF extraction module 398,078 / 97,248 bytes; PDF worker 1,078,612 / 238,652 bytes. Parser/worker assets are lazy-loaded after file selection; the importer component adds about 3.2 KB Brotli to the onboarding page.
- Five synthetic CV scenarios produced 19 relevant suggestions, 0 misses within tested vocabulary, and 0 false positives. The phrase `FTE analysis` alone intentionally produces no suggestion because it is too broad to map confidently; `Contact centre automation impact evaluation included FTE analysis.` matches the approved contact-centre automation impact evaluation competency. This is a conservative phrase boundary, not a missing canonical competency or a claim of complete CV coverage. Negated/aspirational language was not presented as established competence.
- Catalogue patch review: complete patch is available separately as `geoffy-vtex-catalogue-review.patch`; final commit/PR approval remains pending.
- The uniquely named disposable Supabase test stack was stopped after testing. `supabase/config.toml` was restored to `commonwork-mvp` and its original local ports; no hosted resources were changed.
