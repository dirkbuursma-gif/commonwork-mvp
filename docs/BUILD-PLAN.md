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

Acceptance: members can describe a business need in ordinary language; results explain relevance and gaps; private needs and demographic restrictions are enforced.

### 4. Introductions

- Introduction request and double opt-in
- Mutual-contact and trusted-Connector routes
- Consent, decline, expiry, completion and follow-up

Acceptance: contact information stays hidden until consent; the recipient sees why and why now; declining is private and easy.

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
