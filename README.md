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

## Validation

```sh
npm run check
npm run build
npx playwright install chromium
npm test
```

The end-to-end tests start or reuse the local server at `http://127.0.0.1:4321`.

## Project map

- `reference/` contains the unmodified first HTML prototype.
- `docs/PRODUCT.md` describes the proposition, principles and exclusions.
- `docs/DATA-MODEL.md` describes entities, matching boundaries and access rules.
- `docs/BUILD-PLAN.md` defines the implementation batches.
- `src/lib/supabase/` contains browser and SSR client factories.
- `src/middleware.ts` protects application routes and redirects signed-out visitors.
- `tests/foundation.spec.ts` covers the foundation's redirect, theme and mobile layout.

See [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md) before starting the next implementation batch.
