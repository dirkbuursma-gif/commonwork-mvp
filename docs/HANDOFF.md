# Geoffy / VTEX draft review-field correction

## Checkpoint

- Branch: `feature/geoffy-vtex-seed`
- Implementation commit: `f808e038c441b765cec399ff6784f8bafc888982`
- The implementation commit is the committed Geoffy/VTEX draft catalogue batch.
- The review-field correction described below is uncommitted. No commit, push,
  merge or deployment has been made.

## Scope and review semantics

This correction is limited to separating upstream provenance from Commonwork
editorial review for the Geoffy and VTEX draft records.

- `reviewed_at` and `reviewed_by` mean a completed Commonwork editorial review.
  The existing schema requires them to be both null or both populated, and
  `reviewed_by` is a text identity rather than a profile foreign key.
- `source_system`, `source_record_id` and `source_url` preserve source
  provenance. Geoffy remains attributed to its partner intake; VTEX remains
  attributed to the Commerce Partners catalogue.
- Geoffy and VTEX remain drafts with `published_at = null`. Their descriptions,
  caveats, category and competency links are unchanged.
- No schema migration was required. No publication rule was changed.

## Changed files

Uncommitted task changes:

- `supabase/seed.sql` — clear the Commonwork review fields for the Geoffy
  provider/product and VTEX provider/product while retaining source attribution.
- `tests/provider-onboarding.spec.ts` — assert null Commonwork review fields,
  preserved provenance, draft/unpublished status, member RLS invisibility,
  category-page exclusion and exclusion from need-product suggestions.
- `docs/DATA-MODEL.md` — clarify the distinction between source provenance and
  Commonwork review, including the text identity format of `reviewed_by`.
- `docs/HANDOFF.md` — this checkpoint.

The implementation commit `f808e03` contains only the earlier batch scope in
`supabase/seed.sql` and `tests/provider-onboarding.spec.ts`; it does not contain
the changes listed above.

## Validation

Validated with Node.js 22.23.3:

- `npm run check` — passed: 74 files, 0 errors, 0 warnings, 0 hints.
- `npm run build` — passed.
- `npm test` — all 37 Playwright tests passed.
- `git diff --check` — passed.

The full test suite ran against a temporary copy of the repository with a
distinct Supabase project ID (`commonwork-mvp-validation-gvr`) and alternate
ports. Its database was reset only in that isolated test environment. The
temporary workspace and Supabase services were stopped/removed afterward. The
preserved Commonwork local database was not reset, seeded or modified.

## Visibility and review limits

- Draft providers and products remain unavailable to authenticated members
  through RLS.
- Draft records remain absent from Intelligence category pages and
  `get_need_product_suggestions`.
- There is no curator-facing draft-review interface. Editorial inspection
  requires a privileged review workflow; a member walkthrough cannot inspect
  these draft records or their review metadata.
- Hosted readiness and hosted acceptance gates are unverified and outside this
  batch.

## Preserved local state

The pre-existing `supabase/config.toml` modification is untouched. These
untracked files are also untouched:

- `Commonwork.docx`
- `Features-cw.docx`
- `Fictional test users Commonwork.docx`
- `scripts/scan-secrets 2.py`

The existing Commonwork local database still has zero auth users, profiles,
needs and introductions; 16 providers, 24 products, 72 email deliveries, 4
pilot audit rows and 1 email event. No fictional accounts were added.

## Next step

Review the uncommitted diff, then prepare a PR. Do not treat local validation as
hosted readiness or publish either draft as part of this correction.
