# Agentic-commerce playbook: handoff

Status: integrated into the Lisbon event with event-attendee authorization. The final event material rows and deployment remain operational steps. Platform sources are attributed; vendor descriptions remain vendor claims.

## Purpose

A browser-based presentation and audience guide for the Lisbon agentic-commerce talk, built inside the Commonwork app. The audience browser guide and printable guide share one six-page content source; the presentation has a title slide followed by eight narrative sections.

| Route | View |
| --- | --- |
| `/events/{slug}/presentation` | Browser presentation, available only to an approved attendee or event manager when presentation material is attached |
| `/events/{slug}/guide` | Audience-safe retailer guide and optional local-only visibility worksheet, gated to approved attendees or the event manager |
| `/events/{slug}/guide/print` | Audience-safe six-section print layout with the protected PDF download action |

There are no root `/playbook` public routes or middleware bypasses. The event detail route remains public as intended; playbook content requires sign-in plus approved event attendance or manager access. The print PDF is served through the existing short-lived signed URL endpoint and private storage bucket.

## Current presentation checkpoint

- The approved direction is real current examples → retailer challenges → expertise plus AI → product-data/PIM and API foundations → qualified tools → start today.
- The presentation opens with “Agentic Commerce: When AI Enters the Shopping Journey” and identifies Dirk Buursma / Commerce Partners separately from Commonwork / The Collaborative Commerce Network. Its eight narrative sections use the corresponding IDs and shared copy in `src/lib/playbook/audience-guide.ts`. The first narrative slide uses an editorial summary of Dirk's supplied Perplexity shopping-research response, with three response-named product destinations and retailer questions. The next slide keeps OpenAI's published checkout example separate; the examples are not one transaction.
- The attendee guide shows the prepared demonstration prompt, concise summary, expandable full supplied response, S1-S6 source links and supplied Perplexity thread. Its print layout shows only the concise summary, destinations, questions and limitations; no unconfirmed public browser URL is printed.
- Prompt/session correspondence, capture date/time, account plan and session settings remain unconfirmed in `src/lib/playbook/perplexity-stroller-example.ts`. The prompt is labelled "Demonstration prompt prepared for this example." The untimed presenter explanation and confirmation gate are attached to the internal opening-section notes; neither is rendered in attendee routes.
- The Geoffy MP4 is excluded from the shared source tree: full content review and reuse permission remain outstanding. The presentation identifies the clip as withheld; no MP4 or extracted event-branding assets are included in the remote repository. Be.Cited appears only in internal records.
- Slide 8 (the final narrative slide) has a Panel Debate Statements dialog containing three prompts on data governance, channel control and margin, and operating model/competence. The opening slide is slide 1; existing narrative section deep links remain stable.
- The event-bound browser guide and print layout render the same six-section retailer guide via `src/components/playbook/AudienceGuide.astro`. The browser route links to the optional local-only visibility worksheet. Internal `SectionBody`, presenter notes, status badges, pending records and the internal review handout are not rendered on attendee routes.
- The print layout's PDF button posts a permitted event-material ID to `/api/events/material`; the existing RLS check and private storage bucket issue a 300-second download URL only to approved attendees or the event manager.
- The previously generated presentation, audience-guide and print-guide PDFs are preserved unchanged as review artifacts. The current screen-fit presentation PDF is written separately under `docs/review-preview/screen-fit/`; the audience and print PDFs were not regenerated for this slide-only adjustment.
- Dirk confirmed a maximum talk duration of 20 minutes: target 18 minutes of content, including supplier-video playback if later approved, plus 2 minutes of buffer. The event date and scheduled slot remain unconfirmed. The English full rehearsal script is in `docs/PLAYBOOK-SPEAKER-SCRIPT.md` and is internal only; no Dutch script was added. The Geoffy clip and extracted event-branding previews are excluded from Git pending content/reuse review. The requested 60-second Geoffy clip remains an explicit exception to the earlier 45-second target; Be.Cited and Rierino remain capped at 45 seconds each. Slide 7 remains 4:30 and the overall content/buffer target is unchanged. The script mentions Be.Cited as pending, but current slide 7 omits it; do not present it until the clip is reviewed and the slide is separately approved. Contact destination, branding, demo recording, live result and publication approval remain unconfirmed. Public routes stay `noindex` while publication is unapproved.

## Branch and base

- Feature branch: `feature/agentic-commerce-playbook`
- Base: `10f2ced772fdd6b4cef1a3e13718d3315beaec32` from `origin/build/pilot-hardening` (merge of PR #9). The playbook work is isolated on `feature/agentic-commerce-playbook`.
- Worktree: `~/Developer/commonwork-playbook`, separate from the Geoffy/VTEX checkout `~/Documents/commonwork-mvp`, which holds unrelated uncommitted work and must not be disturbed. This worktree was moved out of iCloud Drive after file-provider activity made Astro startup take several minutes.
- Vercel's production branch has **not** been established. The base is a development decision, not a deployment decision.

## Runtime and package manager

- Node.js `22.23.3` (`engines.node >=22.12.0`; CI uses `22.12`), installed through `fnm` in `~/.local/share/fnm`.
- npm `10.9.9`. The lockfile is `package-lock.json`; use `npm ci`, never `npm install`, and do not regenerate the lockfile.
- No runtime-version file is committed yet.

## Commands

```sh
git fetch origin
git worktree add --no-track -b feature/agentic-commerce-playbook <folder> <base commit>   # first time only
npm ci
npm run dev -- --host 127.0.0.1 --port 4321
npm run check              # astro check
npm run build
npm run test:playbook      # isolated, no Supabase and no Docker
npx playwright install chromium   # once per machine
node scripts/capture-playbook-previews.mjs # refresh three review PDFs and nine stage images
node scripts/capture-playbook-previews.mjs --presentation-screen-review # write revised presentation + title slide and slides 5, 7, 8 to screen-fit/
```

From the worktree root, the exact local preview command is `npm run dev -- --host 127.0.0.1 --port 4321`. Browser routes:

- `http://127.0.0.1:4321/playbook/present` — interactive nine-slide presentation (title plus eight narrative sections).
- `http://127.0.0.1:4321/playbook` — audience playbook.
- `http://127.0.0.1:4321/playbook/print` — concise audience-safe print guide.

The export command defaults to `http://127.0.0.1:4321`; set `PLAYBOOK_PREVIEW_URL` only if the local preview uses another address. It writes the presentation, audience-guide and concise print-guide PDFs plus nine `slide-*.png` files under `docs/review-preview/`. It does not write or overwrite the internal `agentic-commerce-playbook-review.pdf`.

### Latest verification

- `npm run check`: most recently passed with 0 errors, 0 warnings and 0 hints.
- `npm run build`: passed; local Astro/Vercel SSR build only.
- `npm run test:playbook`: passed, 49 tests. The suite covers the title slide and default navigation, section deep links, panel debate, slide bounds, print/public hygiene, route access, mobile layout and no-external-request checks. The isolated server uses port 4323, refuses local `.env*` files other than `.env.example`, strips credentials and enables the loopback network guard. The Supabase-backed default suite was not run.
- The presentation, audience-guide and print-guide preview PDFs and nine slide captures were regenerated. The separate screen-fit export includes the title slide and selected narrative slides. The detailed `agentic-commerce-playbook-review.pdf` was not overwritten and remains internal.
- The preview exporter verified all nine presentation slides at 1600×900: no vertical or horizontal slide overflow; the print deck contains nine 16:9 pages. The title and final narrative slide both fit without scrolling.
- The audience-guide and concise print-guide PDFs were regenerated from their unchanged public routes. The internal 15-page `agentic-commerce-playbook-review.pdf` remains an internal review artifact, not an audience deliverable.

The existing `npm test` is unchanged. It starts local Supabase and needs Docker. Do not run it for playbook work.

## Environment

Names only. Values must never be committed.

- The playbook needs **none** of the variables in `.env.example`.
- Preview with no `.env*` file in the folder and none of the following set in your shell: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `CRON_SECRET`, `APP_BASE_URL`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `SEED_EMAIL_MODE`.
- Without the Supabase variables, every other route redirects to `/sign-in`.
- `scripts/playwright-playbook-server.mjs` refuses to start if any `.env*` file other than `.env.example` is present, strips the names above from its environment and blanks the two `PUBLIC_SUPABASE_*` variables.
- Do not copy `.env.local` or `.vercel` between folders.

## Implemented

- `src/lib/playbook/content.ts`: internal typed presentation copy, speaker notes, evidence labels/source register, claim-to-source entries, video shortlist, worksheet prompts/fields, influence map, tool roles, resources and contact placeholder.
- `src/lib/playbook/audience-guide.ts`: shared audience-safe six-section guide, separate shopping-research and checkout examples, attributed provider roles, expert workflows and first-month plan.
- `src/lib/playbook/perplexity-stroller-example.ts`: supplied prompt, response, product destinations, S1-S6 sources, public limitations, internal unconfirmed metadata and untimed presenter note. Product facts, prices and stock remain response statements, not independently reverified or current claims.
- `src/lib/events/material-access.ts`: verifies event existence and manager/approved-attendee access through the signed-in member client; event material rows remain protected by RLS.
- `src/layouts/PlaybookLayout.astro` and `src/styles/playbook.css`: system fonts only, no import of `tokens.css` (which loads Fontshare), `noindex` while in draft.
- `src/components/playbook/`: internal `SectionBody` and evidence components, plus `AudienceGuide` shared by public browser and print routes.
- `src/pages/events/[slug]/presentation.astro`, `guide.astro`, and `guide/print.astro`: event-bound views.
- Presentation: previous/next buttons, arrow keys, PageUp/PageDown, Home/End, Space; keys ignored in inputs, textareas, selects and editable content; hash deep links; optional fullscreen button that appears only when supported; exit link; works without JavaScript as a stacked page. It starts with the identity-separated title slide, retains eight narrative section IDs, and has the final-slide debate dialog. The Geoffy demo is withheld pending review and reuse permission. Audience-guide and print routes exclude presentation-specific material; internal review records are not shown.
- Presentation print mode: all nine slides visible, fixed 16:9 landscape page size, one slide per page; slide controls and live announcement are omitted from print.
- Public print view: renders the same six-section audience guide as `/playbook`, with sources and no presenter notes, review labels, pending-asset records, internal video cards or claim register. It links back to the browser worksheet; it is not a PDF download. The old internal review PDF remains in `docs/review-preview/` and is not linked by a public route.
- Tests: `playwright.playbook.config.ts` (port 4323, `reuseExistingServer: false`), `playbook-tests/playbook.spec.ts`, `scripts/playwright-playbook-server.mjs`, `scripts/playbook-network-guard.mjs`.
- `src/middleware.ts`: event detail remains public editorial information; nested event material routes use the normal authenticated boundary.

### Changed-file inventory

Files updated for the current audience-guide and presentation implementation:

- Source: `src/lib/playbook/audience-guide.ts`, `src/lib/playbook/perplexity-stroller-example.ts`, `src/lib/playbook/content.ts`, `src/components/playbook/AudienceGuide.astro`, `src/components/playbook/VisibilityWorksheet.astro`, `src/pages/playbook/index.astro`, `src/pages/playbook/print.astro`, `src/pages/playbook/present.astro`, `src/styles/playbook.css`.
- Export and tests: `scripts/capture-playbook-previews.mjs` (three review PDFs by default; `--presentation-screen-review` writes only the revised deck and title/selected slides to a separate folder), `playbook-tests/playbook.spec.ts`.
- Handoff: `docs/PLAYBOOK-HANDOFF.md`.
- Generated review artifacts in `docs/review-preview/`: presentation, audience-guide and print-guide PDFs; the separate screen-fit presentation PDF and captures in `screen-fit/`. The older detailed `agentic-commerce-playbook-review.pdf` remains a local internal artifact and is not part of the feature change.

The separate `screen-fit` presentation PDF is the newest screen-fit review artifact. The presentation, audience-guide and print-guide PDFs were regenerated from current routes. The internal review PDF remains unlinked and is not an audience deliverable.

The feature includes the audience page, shared content/routes, components/layout/styles, middleware/package changes, isolated test configuration/server scripts, review materials and preview exports. The Geoffy video and extracted event-branding previews are intentionally excluded.

### Export inspection scope

- Screen-fit presentation PDF: all nine 16:9 pages were verified. The audience PDF has nine A4 pages (cover, six sections, two-page worksheet); the concise print PDF has six A4 pages, one section per page.
- Current audience browser guide: tested in Playwright for six sections, source attribution, optional worksheet, absence of internal notes/statuses/pending Be.Cited/video cards, and mobile overflow.
- Current `/playbook/print`: tested under print media for six audience sections and absence of internal review content; exported pagination was verified with PDF.js.

### Authentication-boundary change

The standalone root `/playbook` pages and their anonymous middleware allowlist are not included in the integrated app. Only `/events/{slug}` is public event information. `/events/{slug}/presentation`, `/guide` and `/guide/print` pass the global sign-in boundary and then verify manager or approved-attendee status. Each page sends `Cache-Control: private, no-store`; material metadata and private-object access retain their existing RLS policies. No speaker script, reviewer notes or internal evidence register is rendered on attendee pages.

## Outstanding review and publication decisions

- Confirm the final public Commonwork URL and canonical domain. The preview paths are local/provisional; no public URL is approved.
- Confirm the QR destination after the public URL is approved. No QR is present.
- Confirm event title/date and organiser branding, organizer/sponsor roles, selected logo(s) and reuse permission. Extracted branding previews are excluded from the repository; no branding has been placed.
- Pending vendor-verification task: for Geoffy, AdMultify and Rierino, confirm the exact role, supporting recorded source and commercial relationship. Record three evidence classes separately: (1) capability described in official vendor documentation, (2) performance/outcome claims with evidence beyond vendor copy, and (3) capabilities actually demonstrated by Commonwork with permission. Current records are vendor descriptions, not independent performance evidence or Commonwork demonstrations; no integration, endorsement or result is claimed. Keep vendor names off stage until each included role is verified and accurately qualified; retain their attributed qualifications in the handout.
- Confirm reuse permission and review the full Geoffy clip before any future approved presentation update; the MP4 is excluded from the shared source tree and the presentation marks it withheld. Have a person verify the actual OpenAI player beats before presentation. The OpenAI link remains publisher-hosted; nothing was downloaded or re-hosted.
- Decide whether to produce the worksheet walkthrough. No recording exists; the audience slide uses only the blank worksheet visual and the handout states the recording is unavailable.
- Approve a public contact destination. The existing placeholder remains; no email, sign-up, QR or contact route is linked.
- Confirm deployment branch and preview access protection before pushing or creating a hosted Preview. Do not expose event materials by adding public route exceptions.
- Decide publication indexing (`noindex` remains while draft) and review the title slide and eight-section narrative before publication. The content target is 18 minutes including supplier videos only if later approved, plus a 2-minute buffer; the actual event slot is unconfirmed. Presenter notes remain untimed.

## Known limitation on this machine

`~/Documents` is synced by iCloud Drive. With `node_modules` there, Astro startup and route compilation stalled for several minutes while the file provider was busy. The presentation worktree has been moved to `~/Developer/commonwork-playbook`, which is on the local home volume, to avoid that delay.

## Resuming on either MacBook

Work does not move between machines by itself. To switch machines:

1. On the machine you are leaving: review, `git add`, `git commit`, then `git push -u origin feature/agentic-commerce-playbook`. Only after your explicit approval.
2. On the other machine: `git fetch origin`, then either `git worktree add ../commonwork-playbook feature/agentic-commerce-playbook` or, in an existing checkout, `git switch feature/agentic-commerce-playbook` followed by `git pull`.
3. Install Node 22.x (`fnm install 22.23.3`), run `npm ci`, then `npx playwright install chromium`.
4. Read this file. Do not rely on chat history.

Uncommitted changes exist only on the machine where they were made.

## Next step

Wait for Dirk's presentation review. Treat the reported technical checks as the implementation checkpoint only, not final content or publication approval. Make no further changes, commits, pushes or deployments until a new presentation-specific instruction is approved. Insights remains parked and B1 remains paused.
