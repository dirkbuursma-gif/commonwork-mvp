# Commonwork Data Model

## Entities

| Entity | Purpose |
| --- | --- |
| `profiles` | Member identity, summary, discovery and contact preferences |
| `competencies` | Shared competence vocabulary |
| `profile_competencies` | Competencies a member offers and their explanations |
| `competence_evidence` | Projects, outcomes and validations supporting an offered competence |
| `competence_needs` | Business outcomes and capabilities a requester needs |
| `need_competencies` | Essential and useful competencies attached to a need |
| `matches` | Saved, rule-calculated candidates for a need |
| `match_reasons` | Strengths, evidence, gaps and human-readable rationale |
| `introductions` | Proposed professional introductions and their workflow state |
| `introduction_participants` | Participant consent and role for an introduction |
| `connectors` | Trusted introduction facilitators |
| `events` | Partner or Commonwork events |
| `event_members` | Event participation |
| `event_objectives` | Event-specific competencies sought or offered |
| `introduction_feedback` | Relevance and conversation outcome after an introduction |

## Competence and evidence

Competence categories are `knowledge`, `practical_capability` and `way_of_working`. A profile competence includes the member's explanation, evidence status and conversation availability. Do not use self-assigned seniority labels such as beginner, intermediate or expert.

Evidence status values:

- `declared`
- `demonstrated`
- `peer_confirmed`
- `outcome_verified`
- `commonwork_demonstrated`

Evidence records can reference projects, outcomes or peer validations. Private evidence is visible only to its owner unless the owner explicitly shares it for a match or introduction.

## Competence needs

A need captures a business outcome, problem to solve, essential and useful competencies, context, what the requester offers, preferred conversation type, visibility and expiry. Visibility values are `private_matches` (default), `selected_group`, `event_members` and `network`.

## Matching

Initial internal weighting:

- Essential competence overlap: 50
- Evidence strength: 25
- Relevant problem or outcome: 15
- Availability and contact preference: 10

Do not display a precise percentage. Present `Strong relevance`, `Good relevance` or `Possible relevance`, alongside matching competencies, supporting evidence, relevant outcomes, gaps, availability and an introduction route. Titles, follower counts, age, gender and location never increase the score. Location is an optional practical constraint only.

## Introduction states

`draft`, `awaiting_requester`, `awaiting_recipient`, `awaiting_connector`, `accepted`, `introduced`, `declined`, `expired`, `completed`.

Contact details remain hidden until the required participants consent. Declines are private to the recipient and requester as appropriate; no contact details are exposed on decline or expiry.

## Access control requirements

- All primary keys are UUIDs; `profiles.id` references `auth.users.id`.
- Every table includes `created_at`; editable records include `updated_at`.
- Enable row-level security on every table.
- Members edit only their own profile, competencies, needs and evidence.
- Discoverable profiles expose only fields explicitly marked discoverable.
- Private evidence is visible only to its owner.
- Needs are visible to the owner and explicitly eligible matched members under the need's visibility rules.
- Introduction records are visible only to participants and assigned Connectors.
- Event objectives are visible only to authorised event members.
- Administrative roles live in a protected role table, never in user-editable profile flags.
- No browser operation uses a service-role key.

Do not include age, gender, date of birth, nationality or similar demographic attributes in the matching model. Store location only as optional practical availability information.
