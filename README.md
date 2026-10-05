# Commonwork MVP

An invite-only, competence-first professional network. The MVP focuses on the loop from competence offered, to competence needed, to explained match, to trusted introduction.

## Local setup

Requirements: Node.js 22.12 or newer.

```sh
npm install
cp .env.example .env
```

Set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` in `.env`. The anon key is intended for browser use with row-level security enabled. Never put a service-role key in client code or a `PUBLIC_` variable.

Start the local server using the repository convention:

```sh
npx astro dev --background
```

The app is available at <http://localhost:4321>. Stop it with `npx astro dev stop`.

The development-only **Enter local test workspace** option is a read-only preview identity. It does not create a Supabase user and cannot save profile data. Use a real invited local Supabase account for database-backed onboarding.

## Validation

```sh
npx playwright install chromium
npm run check
npm run build
npm test
```

`npm test` starts local Supabase and a separate Astro test server at `http://127.0.0.1:4322`. The test helper creates temporary authenticated users through the local-only admin API; the service-role key is kept in the Node test process and stripped from the Astro server environment.

## Project map

- `reference/` contains the unmodified first HTML prototype.
- `docs/PRODUCT.md` describes the proposition, principles and exclusions.
- `docs/DATA-MODEL.md` describes entities, matching boundaries and access rules.
- `docs/BUILD-PLAN.md` defines the implementation batches.
- `src/lib/supabase/` contains browser and SSR client factories.
- `src/middleware.ts` protects application routes and redirects signed-out visitors.
- `src/pages/onboarding.astro` provides the four-step competence-profile flow.
- `src/pages/profiles/[id].astro` separates owner and discoverable member-profile views.
- `src/pages/find/` provides guided need creation, editing and requester-only explained match results.
- `src/lib/need-data.ts` contains explicit-column reads for needs, matches, reasons, profiles and authorized evidence.
- `supabase/migrations/` defines profile and need RLS, the controlled competence vocabulary, and deterministic transparent matching.
- `tests/` covers foundation, profile CRUD, onboarding, need lifecycle, matching and two-user RLS boundaries.

See [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md) before starting the next implementation batch.
