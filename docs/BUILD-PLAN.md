# Commonwork Build Plan

## Stack

Astro with TypeScript and server rendering; Supabase for authentication, PostgreSQL and row-level security; Vercel for deployment; plain CSS tokens and components; Playwright for end-to-end checks. Keep the matching engine rule-based. Do not add another API framework, messaging service, search engine or AI matching service.

## Batches

### 1. Foundation

- Astro SSR and Vercel adapter
- Supabase browser/server clients and invite-only auth guard
- Base app layout and responsive navigation
- Light and dark themes with prototype-derived CSS tokens
- Empty, error and sign-in states
- Product, data model and build plan documentation

Acceptance: Astro check and production build pass; the prototype's visual language is recognisable; responsive navigation and themes work at mobile and desktop sizes; unauthenticated app routes redirect to sign-in.

### 2. My Competence

- Onboarding and profile editor
- Add/remove competencies and evidence
- Conversation preferences and availability
- Discoverable competence profile

Acceptance: a member can complete a useful profile without demographic data, attach evidence, and keep private evidence private.

### 3. Find Competence

- Guided need form with essential/useful competencies
- Visibility and expiry controls
- Need detail, rule-based matching and explained result cards
- Save and dismiss actions

Acceptance: members can save an incomplete private draft, return to activate it, and review relevant people with strengths, shareable evidence, gaps, availability and unknowns. Private needs and all match results are requester-only; network briefs are explicitly shared; internal scores and reason weights are not client-readable; expired needs generate no new matches. Matching is deterministic and excludes demographic and prestige proxies. Batch 3 does not create introductions, events or messaging.

### 4. Introductions

- Contextual introduction request from an existing eligible match
- Direct double opt-in, suggested introducer and trusted Connector routes
- Owner-managed private contact methods with post-consent release
- Private consent, decline, one clarification, expiry, cancellation, completion and feedback
- Recipient-only in-app notifications and an introduction inbox

Acceptance: the recipient sees exactly what the requester will share and may privately accept, ask one clarification, decline or choose not now. Suggested introducers confirm they know both people before introduction; Connectors are provisioned outside member controls and see only assigned work. Contact values remain hidden until required consent. State transitions are transactional and tested for concurrency, expiry, retries and unrelated-user privacy. No general messaging, events, recruitment or email automation.

### 5. Events

- Event list/detail and invitation-link joining
- Event objectives and event-specific matching
- Host introduction request, meeting confirmation and follow-up

Acceptance: invited members reuse their profile, receive explained matches and continue relationships on Commonwork; no ticketing or schedule management.

### 6. Administration

- Invite members, create events and designate Connectors
- Review reports, deactivate accounts and inspect introduction state

Keep administration small and role-protected.

## Local development

```sh
npm run dev
npm run check
npm run build
npm test
npx supabase start
npx supabase db reset
```

Copy `.env.example` to `.env` and configure the local or hosted Supabase URL and anon key. Never expose a service-role key in browser code or a `PUBLIC_` variable.

## Delivery

Use one reviewed branch per batch. Deploy Vercel Preview for review and Production for the invited pilot. Configure the exact local and deployed callback URLs in Supabase Auth. Test row-level security with at least two independent user accounts before enabling real member data.

## Pilot measures

Measure completed competence profiles, competence needs created, relevant matches reviewed, introduction requests accepted, conversations completed and matches confirmed useful. Do not optimize for registrations, followers or time spent.
