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
| `notifications` | Recipient-only in-app introduction lifecycle updates |
| `introduction_audit` | Private actor/action/state-transition audit history |

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

The first competence-profile migration implements these profile fields: `id`, `display_name`, `professional_summary`, `what_i_contribute`, `what_i_am_exploring`, `profile_visibility`, `onboarding_completed`, `created_at` and `updated_at`. Profile visibility is `private` or `members`, defaulting to `private`.

Each profile competence has one canonical `competency_id`, a member-authored statement, an evidence status and an explicit `discoverable` flag. A unique constraint prevents duplicate assignments. Members may set only `declared` or `demonstrated`; peer-confirmed and outcome-verified states require future confirmation workflows.

Evidence has a title, context, contribution, outcome, optional HTTP(S) link and visibility. Visibility is `private`, `matches_only` or `members`, defaulting to `matches_only`. Evidence URLs are validated by the application. Deleting a profile competence cascades to its evidence.

Contact preferences default closed: all conversation-type booleans are false, availability is `unavailable`, and monthly conversation capacity is zero. Capacity must be non-negative. The owner-only `contact_preferences` table contains `commercial_approaches`; the public projection deliberately excludes it.

Canonical competencies are seeded and changed through migrations. Members submit missing terms to `competency_suggestions`, where they remain `pending`; member roles cannot edit canonical vocabulary or approve suggestions.

Onboarding completion is calculated in PostgreSQL from a non-empty display name, professional summary and contribution statement, at least one competence, at least one evidence item, and saved contact preferences. Clients cannot set the completion flag.

### Member-facing read boundaries

- `get_my_profile()` returns profile details only for `auth.uid()`.
- `discoverable_profiles` returns only `id`, `display_name`, `professional_summary`, `what_i_contribute` and `what_i_am_exploring`, and only for completed profiles marked `members`.
- `discoverable_contact_preferences` returns explicitly opted-in conversation types, availability and capacity for discoverable profiles; it excludes `commercial_approaches`.
- `discoverable_member_competencies` returns only active competencies explicitly marked discoverable on completed member profiles.
- `member_match_reasons` returns explanation fields only to the requester; `member_match_feedback` returns feedback only to its creator.
- Evidence is queried separately under RLS. `private` and `matches_only` remain owner-only through direct table reads. A security-definer helper returns only `matches_only` and `members` evidence for the owner of an active, unexpired need and only for an existing matched profile. `members` evidence is also available with its owner's discoverable profile and discoverable competence.
- Server queries select named columns; member-facing routes never use `select('*')`.

## Competence needs

A need captures a business outcome, problem to solve, essential and useful competencies, context, what the requester offers, preferred conversation type, visibility and expiry. Visibility values are `private_matches` (default), `selected_network`, `selected_event` and `network`. Only `private_matches` and `network` can be activated in this release; selected scopes stay unavailable until their membership and RLS boundaries exist. A network brief is readable by signed-in members while active and unexpired, but its match results remain requester-only.

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
