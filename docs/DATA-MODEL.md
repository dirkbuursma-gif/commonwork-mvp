# Commonwork Data Model

## Entities

| Entity | Purpose |
| --- | --- |
| `profiles` | Member identity, summary, discovery and contact preferences |
| `competencies` | Shared competence vocabulary |
| `profile_competencies` | Competencies a member offers and their explanations |
| `competence_evidence` | Projects, outcomes and validations supporting an offered competence |
| `contact_preferences` | Private contact types, availability and monthly conversation capacity |
| `profile_contact_methods` | Owner-only email or calendar URL explicitly selected for consented introductions |
| `competency_suggestions` | Member-submitted vocabulary suggestions pending review |
| `competence_needs` | Business outcomes and capabilities a requester needs |
| `need_competencies` | Essential and useful competencies attached to a need |
| `matches` | Rule-calculated relevant people for a need; internal scores are not member-readable |
| `match_reasons` | Strengths, evidence, gaps and human-readable rationale |
| `introductions` | Proposed professional introductions and their workflow state |
| `introduction_participants` | Participant consent and role for an introduction |
| `connectors` | Trusted introduction facilitators |
| `connector_assignments` | Suggested-introducer or trusted-Connector assignment and confirmation |
| `events` | Partner or Commonwork events |
| `event_members` | Event participation |
| `event_objectives` | Event-specific competencies sought or offered |
| `introduction_feedback` | Relevance and conversation outcome after an introduction |
| `notifications` | Recipient-only in-app introduction and first-publication updates |
| `introduction_audit` | Private actor/action/state-transition audit history |
| `providers` | Curated provider identity with a `provider_type` of `software_vendor`, `service_partner` or `organisation` |
| `provider_products` | Provider-owned software products or packaged service records |
| `provider_categories` | Curated catalogue categories and their definitions |
| `provider_publication_status` | Curator-controlled draft, published or retired status for providers and products |
| `company_membership_plans` | Versionable plan catalogue and benefits; only the configured Business plan is assignable |
| `company_memberships` | Company-level Business plan, status, commercial arrangement, seat terms and benefit snapshot |
| `company_membership_audit` | Private history of membership and commercial changes |
| `company_operator_audit` | Private company, affiliation, catalogue and people-management history |
| `company_publication_review_audit` | Private first-publication review decisions and feedback |

## Competence and evidence

Competence categories are `knowledge`, `practical_capability` and `way_of_working`. A profile competence includes the member's explanation and evidence status. Conversation preferences and availability are stored separately in `contact_preferences`. Do not use self-assigned seniority labels such as beginner, intermediate or expert.

Evidence status values:

- `declared`
- `demonstrated`
- `peer_confirmed`
- `outcome_verified`
- `commonwork_demonstrated`

Evidence records can reference projects, outcomes or peer validations. Private evidence is visible only to its owner. `matches_only` evidence is returned only in the requesting member's authorized match results; it is not exposed to other members. `members` evidence may appear on a discoverable profile.

### Batch 2 implementation

The first competence-profile migration implements these profile fields: `id`, `display_name`, `professional_summary`, `what_i_contribute`, `what_i_am_exploring`, `profile_visibility`, `onboarding_completed`, `created_at` and `updated_at`. Profile visibility is `private` or `members`, defaulting to `private`. The geography migration adds optional, member-entered `base_country_code` and `markets_served` fields. Database and application validation use the same fixed ISO alpha-2 allowlist; markets are limited to 20 unique, non-null codes. Geography is not inferred and does not affect matching or ranking.

Each profile competence has one canonical `competency_id`, a member-authored statement, an evidence status and an explicit `discoverable` flag. A unique constraint prevents duplicate assignments. Members may set only `declared` or `demonstrated`; peer-confirmed and outcome-verified states require future confirmation workflows.

Evidence has a title, context, contribution, outcome, optional HTTP(S) link and visibility. Visibility is `private`, `matches_only` or `members`, defaulting to `matches_only`. Evidence URLs are validated by the application. Deleting a profile competence cascades to its evidence.

Contact preferences default closed: all conversation-type booleans are false, availability is `unavailable`, and monthly conversation capacity is zero. Capacity must be non-negative. The owner-only `contact_preferences` table contains `commercial_approaches`; the public projection deliberately excludes it.

Canonical competencies are seeded and changed through migrations. Members submit missing terms to `competency_suggestions`, where they remain `pending`; member roles cannot edit canonical vocabulary or approve suggestions. Contact-centre automation impact evaluation, staffing-capacity planning and event coordination are practical-capability terms. Related vocabulary concepts are editorial context only; they do not assert proficiency, verification or matching weight.

Onboarding completion is calculated in PostgreSQL from a non-empty display name, professional summary and contribution statement, at least one competence, at least one evidence item, and saved contact preferences. Clients cannot set the completion flag.

### Member-facing read boundaries

- `get_my_profile()` returns profile details only for `auth.uid()`.
- `discoverable_profiles` returns only `id`, `display_name`, `professional_summary`, `what_i_contribute`, `what_i_am_exploring`, `base_country_code` and `markets_served`, and only for completed profiles marked `members`.
- `discoverable_contact_preferences` returns explicitly opted-in conversation types, availability and capacity for discoverable profiles; it excludes `commercial_approaches`.
- `discoverable_member_competencies` returns only active competencies explicitly marked discoverable on completed member profiles.
- `member_match_reasons` returns explanation fields only to the requester; `member_match_feedback` returns feedback only to its creator.
- Evidence is queried separately under RLS. `private` and `matches_only` remain owner-only through direct table reads. A security-definer helper returns only `matches_only` and `members` evidence for the owner of an active, unexpired need and only for an existing matched profile. `members` evidence is also available with its owner's discoverable profile and discoverable competence.
- Server queries select named columns; member-facing routes never use `select('*')`.

## Competence needs

A need captures a business outcome, problem to solve, essential and useful competencies, context, what the requester offers, preferred conversation type, visibility and expiry. Visibility values are `private_matches` (default), `selected_network`, `selected_event` and `network`. Only `private_matches` and `network` can be activated in this release; selected scopes stay unavailable until their membership and RLS boundaries exist. A network brief is readable by signed-in members while active and unexpired, but its match results remain requester-only.

## Organisations and ecosystem links

`organisations` (type `retailer`, `vendor`, `si_gtm`, `advisor`, `other` or `research`; provider-linked advisor/research/other organisations are allowed) with `profile_organisations` (member, organisation, role title, one primary per member, verification provenance). Capability links: `product_competency_links`, `organisation_competency_links` and `organisation_product_links` (`implements`, `certified_on`, `integrates`). Needs gain `retailer_organisation_id` (the owner must belong to it, enforced by trigger), `retailer_segment`, `current_stack_note` and `project_context`; these are visible on `network` needs, so members should not enter confidential detail.

Trust model: all organisation, affiliation and capability writes are service-role (curator) only, so members cannot self-declare vendor or partner affiliations. `profile_product_affiliations` records a member's affiliation with one specific provider product. It requires the member to also belong to the organisation that represents the product's provider, and it is shown to other members only when the member has consented and the product and provider are published. Each public provider is a separate identity with its own products; shared ownership between providers (for example Begen/AdMultify and Benext/Be.cited) is deliberately not modelled. Affiliations are readable for the member's own row and for discoverable profiles; product and partner links only when the product and provider are published. `get_need_product_suggestions` and `get_need_partner_suggestions` return results to the need owner only. Matching never uses organisation membership as a relationship signal or a score input; it is shown as commercial-affiliation disclosure.

Provider catalogue: `providers.provider_type` distinguishes `software_vendor`, `service_partner` and `organisation`; existing providers default to `software_vendor`. `provider_products` holds provider offerings, which are software products or packaged managed-service records, with `operating_layer` and `deployment_model` clarifying the offer type. Publication is controlled per provider and per product through `provider_publication_status`, and draft or retired records are excluded from member-facing reads. Categories and their competency links are curator-managed seed data. `supabase/seed.sql` resets the publication status of every seeded record on each run, so it is a local and demo seed and must not be used to overwrite reviewed publication decisions in a shared environment.

### Company membership and publishing

`company_membership_plans` separates plan definitions from company agreements. Community and Professional currently have no configured benefits and are not assignable. Business currently snapshots only the company catalogue profile, company people/seats, and company insight/update capabilities. The availability of each capability is still stateful: catalogue content must be approved and public; seats follow the recorded terms; publishing additionally requires an active Business membership, matching active publishing entitlement, active workspace access, verified affiliation, and an explicit writer assignment. A paid or complimentary status alone grants no writer or administrator authority.

`company_memberships` stores the company's Business plan, active/suspended/revoked status, complimentary-founding or commercial-agreement status, included seat terms, agreement evidence and (for founding arrangements) a 90-day review date. The review date does not expire or convert the membership. Commercial activation requires an HTTPS agreement-evidence URL; payment remains uncollected and must not be represented as received. Writer assignments, affiliations, products, follows and content are preserved when commercial status changes. Seat caps count connected company people, not writer assignments. Seed/demo provider and organisation records cannot be changed through the real-company operator interface.

`profile_organisations` remains the affiliation source of truth. `verification_basis`, `verified_by` and `verified_at` record the approval provenance. `company_publishing_assignments` remains the individual writer-authorisation source; `company_publishing_entitlements` remains the publishing entitlement source and is synchronized with the company's active membership. Membership administration is not exposed to company writers. Operator RPCs require `can_edit_insights()` and write private audit rows. The `/admin/companies` route uses the same server-side role check; email lookup is exact-match and only links an already confirmed account. It never creates or invites an account.

First-publication review remains administrator-role based. The authorization model sees account IDs, not legal persons: two accounts known to belong to one person can therefore be used for author and reviewer roles, but that is not independent review. Returns require feedback; in-app review history is retained. The normal publication trigger still deduplicates notifications, and publication emails are not enabled.

Product following: `product_follows` holds one private row per member and `provider_products.id`. Members have no table access and use narrow RPCs (`follow_product`, `unfollow_product`, `get_product_follow_state`, `get_my_followed_product_count`, `list_my_followed_products`). Only published products with published providers can be newly followed. Unfollowing deletes the row, so only active follows exist and a re-follow starts a new `followed_at`. If a followed product later becomes unpublished the row is kept and shown to its owner as a generic unavailable entry, in the list and in `export_my_member_data`. Following is interest only; it is not endorsement, use, competence, affiliation or an introduction.

Product representatives: `product_representatives` is an operator-granted, product-scoped permission (one active assignment per member and product, revoked rows kept as history, changes audited in `product_representative_admin_audit`). It is never derived from affiliation, membership or payment. It authorises one thing only: `get_product_follower_count`, which returns the current number of active follows from members with active workspace membership and raises an error for anyone else, so an unauthorised caller never sees a zero. It grants no follower identities, exports, contact, editing or publishing rights.

Company follows: `provider_follows` is a private member-to-company relation parallel to `product_follows`; neither changes or implies the other. Members use only `follow_provider`, `unfollow_provider`, `get_provider_follow_state`, `get_my_followed_provider_count` and `list_my_followed_providers`. Company follows are included in the owner's data export and are not readable by writers or representatives.

Company publishing: company content extends `insight_articles` with `content_type` (`commonwork_insight`, `company_insight`, `company_update`), provider scope, optional provider-product scope, author/publisher attribution, first-live timestamp and withdrawal timestamp. Existing Commonwork articles remain provider-unscoped. Composite foreign keys enforce product ownership by provider. Company writers need active workspace membership, an explicitly `approved` `profile_organisations` affiliation with verifier and timestamp, an explicit provider- or product-scoped `company_publishing_assignments` row, and an active `company_publishing_entitlements` row. `legacy_curated` is retained only as historical provenance for pre-verification curator-managed records; it is not sufficient for publishing access. Assignment and entitlement grant/revoke history is audited separately; neither role grants product-representative access.

This slice grants only `complimentary_founding_pilot` entitlements through the trusted operator function. The schema reserves a `paid` type with required billing evidence, but no member-controlled paid path or payment collection is enabled. `review_due_at` is set 90 days after grant as a review prompt; it does not cause automatic expiration or charge conversion. An administrator explicitly revokes or manually expires access after review. New authors' first publication is held for active Commonwork editorial administrator review in `company_author_clearances`; later publishing still checks all current access gates. A published article notifies active company followers and, if product-scoped, matching product followers, deduplicated by recipient/article. Withdrawal, edits and republishing do not create another notice. These notifications are in-app only; the email outbox intentionally does not deliver them.

Product following and representative access summary: ordinary client roles (`anon`, `authenticated`) hold no table privileges on `product_follows`, `product_representatives` or `product_representative_admin_audit`; row-level security is on, there are no policies, and members, representatives and operators acting as members are all denied direct reads and writes. `authenticated` may execute only these functions: `follow_product`, `unfollow_product`, `get_product_follow_state`, `get_my_followed_product_count` and `list_my_followed_products` (own rows only, active workspace membership required); `is_product_representative` (reports only the caller's own status); `get_product_follower_count` (an integer for an active, assigned representative with active workspace membership, otherwise an error); and the existing owner-only `export_my_member_data`, which now includes the caller's own follows. `manage_product_representative` and `list_product_representatives` are executable by `service_role` only and additionally require an active Commonwork administrator as the acting profile; an administrator cannot assign access to themselves. `is_product_followable` and `is_active_product_representative` are internal and executable by no client role. Representative grant and revoke are therefore available only through the trusted operator mechanism (`npm run representative:*`), never through member self-service.

Staffcloud is a `service_partner` with a managed ecommerce support record; Plumbed is a `software_vendor` with an integration platform record. Both are seeded as drafts pending review, and provider-published performance figures are deliberately not reproduced. In local and demo seed data, `imported_at` may reflect the seed baseline used for catalogue rows rather than a literal automated upstream import event for every record. `source_system`, `source_record_id` and `source_url` record source provenance and remain distinct from Commonwork editorial review: `reviewed_at` and `reviewed_by` are set together only after that review is complete. The current `reviewed_by` field is a text identity, not a profile foreign key. Quid is deferred from the public catalogue as a future Finance Operations / Back-office Automation candidate.

Local fictional demo data: `npm run pilot:seed` / `npm run pilot:clear` (`scripts/pilot-seed.mjs`) create about 23 synthetic members (`@pilot.example.test`), 14 organisations, 5 needs and 4 introductions through the real RPCs. The script refuses non-localhost Supabase hosts. Set `PILOT_SEED_PASSWORD` (12+ characters) for a known sign-in password; otherwise passwords are random.

## Intent signals

Internal-only `member_activity_events` plus the `member_intent_scores` and `organisation_intent_scores` views record that meaningful actions happened, never their content. See [INTENT-SIGNALS.md](./INTENT-SIGNALS.md).

## Matching

Initial internal weighting:

- Essential competence overlap: 50
- Evidence strength: 25
- Relevant problem or outcome: 15
- Availability and contact preference: 10

Do not display a precise percentage. Present `Strong relevance`, `Good relevance` or `Possible relevance`, alongside matching competencies, shareable evidence, relevant context, gaps, availability and unknowns. Batch 3 does not create introductions. Titles, follower counts, age, gender, nationality, education prestige, employer prestige and engagement volume never increase the score; demographic data is not part of the matching query.

## Introductions

Introduction routes are `direct`, `suggested_introducer` and `trusted_connector`. A suggested introducer becomes a confirmed mutual introducer only after they accept and confirm they know both people well enough. No relationships are inferred from shared events, organisations or networks.

Statuses are `draft`, `awaiting_recipient`, `awaiting_requester_context`, `awaiting_connector`, `accepted`, `introduced`, `declined`, `expired`, `cancelled` and `completed`. Database RPCs lock the introduction row, derive the actor from `auth.uid()`, validate expiry, apply a specific transition and write audit/notification rows in the same transaction. At most one active request exists for a need/person pair. One clarification round is allowed; there is no open message thread or scheduler. Expiry is applied lazily on reads/actions after 14 calendar days or when the source need/match becomes ineligible.

`profile_contact_methods` is owner-only and stores email or HTTPS calendar URLs. Authentication email is never copied automatically. Each participant previews and selects their own method; consent snapshots its exact value. A security-definer release RPC returns only the other participant's selected method after status `introduced` or `completed`. Direct table grants never include the contact snapshot value columns. Deleting a contact method does not alter an already consented snapshot.

Decline outcomes are `declined_not_relevant`, `declined_not_now` and `declined_no_capacity`; decline details are returned only in the declining member's own inbox row. Not-relevant blocks another request for that need/person. Not-now honors its optional private `retry_after`. No-capacity permits retry only after availability status changes. Expired and cancelled requests release the active-request constraint.

The approved-context snapshot contains only the need title/problem summary, proposed conversation, requester offer, matching-competence/reason summaries and rationale. It excludes complete/private evidence and does not change when the source need or profile changes.

Connector appointment is privileged; members have no self-appointment field or endpoint. Connectors can access only active/completed assigned work and lose access when replaced. Notifications are in-app and recipient-only. Introduction feedback is private to its author and accepted only after an introduction is issued.

## Access control requirements

- All primary keys are UUIDs; `profiles.id` references `auth.users.id`.
- Every table includes `created_at`; editable records include `updated_at` and database-maintained update timestamps.
- Enable row-level security on every table.
- Members edit only their own profile, competencies, needs and evidence.
- Discoverable profiles expose only fields explicitly marked discoverable.
- Private evidence is visible only to its owner.
- Private needs and match results are visible only to the requester. An active, unexpired network brief and its selected competence terms are visible to signed-in members.
- Introduction records are available through an authenticated inbox RPC only to requester/recipient participants and currently or successfully assigned introducers/Connectors. Replaced intermediaries cannot read prior assignments.
- Authentication email and private contact methods are never discoverable; contact values are released only through the introduction RPC after issue.
- Introduction notifications are readable only by their recipient; feedback only by its author; audit rows have no member grants.
- Event objectives are visible only to authorised event members.
- Administrative roles live in a protected role table, never in user-editable profile flags.
- No browser operation uses a service-role key.

Do not include age, gender, date of birth, nationality or similar demographic attributes in the matching model. Store location only as optional practical availability information.
