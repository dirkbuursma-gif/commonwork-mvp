# Event content notes — In Retail, Brands & CX 2026

## Official source

- Source URL: <https://www.distribuicaohoje.com/inretail/>
- Retrieved: 2026-10-18
- Everything in `src/lib/events/inretail-2026.ts` is transcribed from that page.
  Nothing on the event header is inferred or invented.

## Event and session structure

The `events` table stores a single event row and has no sessions table. The row
represents **our session**; the parent-conference information is rendered from
`src/lib/events/inretail-2026.ts` as page content. The schema was not expanded.

| Level | Value (official) |
| --- | --- |
| Parent event | In Retail, Brands & CX — 16.ª edição |
| Theme | End-to-End Commerce |
| Conference dates | 20·21·22 Out. 2026 |
| Venue | Lagoas Park Hotel, Oeiras (Lisbon area) |
| Day-2 track | Operar à escala: IA, canais, plataformas e controlo comercial |
| Programme block | 11h20 APRESENTAÇÃO + DEBATE — "Agentic commerce: quando a IA entra na jornada de compra" |
| Presentation | 11h20 |
| Debate | 11h35 |
| End time | Not published. The next programme item starts at 12h15; no end time is asserted. |

Times are stored as UTC instants and rendered with `Intl.DateTimeFormat` using
the IANA zone `Europe/Lisbon`, so the offset is resolved rather than hardcoded.
`2026-10-21T10:20:00Z` renders as 11:20 Lisbon time.

The English presentation title "Agentic Commerce: When AI Enters the Shopping
Journey" is kept, with the official Portuguese programme title shown alongside.

## People and attribution

Role wording is quoted from the official programme:

| Person | Official programme wording |
| --- | --- |
| Dirk Buursma | Consultor, Ex Levi's (presentation, 11h20) |
| Rogério Santos | Head of e-Commerce, HomyCasa (debate) |
| Nuno Saraiva | General Manager, L'Oréal Luxe (debate) |
| Sérgio Abrantes | Moderador — Editor-in-Chief, Revista Distribuição Hoje |

Open point: the official programme lists Dirk Buursma as "Consultor, Ex Levi's",
not as Commerce Partners. The page shows the official wording and states
separately that he presents on behalf of Commerce Partners. Confirm before
public release.

The page does not imply that debate participants or the moderator are Commonwork
members or that they endorse Commonwork.

Identities are kept distinct on the page:

- Event branding — In Retail, Brands & CX.
- Organiser/publisher branding — Distribuição Hoje and Skolae Formação.
- Presenter — Commerce Partners.
- Materials/network host — Commonwork.

Commonwork is described as the host of the session resources only. It is not
presented as the conference organiser, and no ticketing or registration is
offered through Commonwork.

## Branding asset provenance

Organiser status was taken from the page's **"Organização"** section, not from
the sponsor strip. That section contains exactly two marks: Distribuição Hoje
and Skolae Formação. (The third image in that region of the page is the
Lagoas Park Hotel venue photo under "Local", not an organiser.)

| File in `public/events/inretail-2026/` | Original source | Original size | Use |
| --- | --- | --- | --- |
| `inretail-brands-cx-2026-header.jpg` | `https://www.distribuicaohoje.com/wp-content/uploads/sites/2/2020/10/INRetailBrandsCX_Topo.jpg` | 1550×570 | Official event mark / header banner |
| `organizer-distribuicao-hoje.jpg` | `https://www.distribuicaohoje.com/wp-content/uploads/sites/2/2025/11/Distribuicao-Hoje.jpg` (alt "Distribuição Hoje", Organização section) | 250×120 | Organiser attribution |
| `organizer-skolae-formacao.jpg` | `https://www.distribuicaohoje.com/wp-content/uploads/sites/2/2025/11/skolae_site.jpg` (alt "SKOLAE Formação", Organização section) | 200×120 | Organiser attribution |

All three are unmodified originals, served at their intrinsic aspect ratio with
`width`/`height` set, and carry descriptive alt text. No logo was invented,
redrawn or reconstructed, no full-page screenshot was used, and no sponsor logos
were included.

The organizer-supplied `Apresentação_ORADORES_INRETAIL.pptx`
(`commerce-partners-operations/partners/skolea/`) was inspected. Its two media
files are composite speaker-template backgrounds that bake the event mark and
both organiser logos into a single JPEG. Clean standalone originals from the
event website were preferred so that no cropping or reconstruction was needed.
The PPTX remains the authority for which marks the organizer supplies, and it
corroborates the three assets above.

### Reuse terms — clarify before public release

These assets were retrieved from the public event website. Online availability
does not establish their public-release reuse terms. They are prepared only for
the protected Preview deployment. Clarify the applicable reuse terms with
Skolae Formação / Distribuição Hoje before any public (Production) release that
shows the event mark or organiser logos.

The previously excluded vendor video remains excluded.

## Access

Public event information (identity, programme, venue, organiser attribution,
official programme link) is rendered for everyone. The presentation, audience
guide and PDF download remain restricted to approved attendees and the event
manager. `src/lib/events/material-access.ts` was not changed.

## Rehearsal timing — revised proposal (15-minute slot)

The official programme places the presentation at 11h20 and the debate at 11h35,
so the presentation slot is **15 minutes**, not the 20 minutes assumed in
`docs/PLAYBOOK-HANDOFF.md` (18 minutes of content plus a 2-minute buffer).

Proposed re-timing: **13:30 of content + 1:30 buffer**. This is a timing proposal
only — no slide content has been cut or rewritten.

| # | Section | Previous | Proposed | Change |
| --- | --- | --- | --- | --- |
| — | Title and framing | 1:00 | 0:45 | −0:15 |
| 1 | A buying decision before the website visit | 2:00 | 1:30 | −0:30 |
| 2 | What the shopper can do today | 2:00 | 1:45 | −0:15 |
| 3 | Brand visibility is not retailer visibility | 2:00 | 1:30 | −0:30 |
| 4 | Who shapes the recommendation? | 1:45 | 1:30 | −0:15 |
| 5 | Check your own visibility | 1:45 | 1:30 | −0:15 |
| 6 | From observation to correction | 1:30 | 1:30 | — |
| 7 | Tools for specific jobs | 4:30 | 2:00 | −2:30 |
| 8 | What the retailer does next, handoff to the debate | 1:30 | 1:30 | — |
| | **Content total** | **18:00** | **13:30** | **−4:30** |
| | Buffer | 2:00 | 1:30 | −0:30 |
| | **Slot total** | **20:00** | **15:00** | |

Section 7 absorbs most of the reduction because its previous 4:30 was sized for
supplier-video playback. No supplier video is approved, and the vendor video
remains excluded, so section 7 is spoken only. Slide 7 keeps all nine slides and
its current copy.

Approval needed before any change to slide copy: the eight sections and the
title slide are unchanged on disk. If 13:30 still runs long in rehearsal, the
proposed reductions to slides 1 and 3 will be shown before being applied.

Section 8 should hand off explicitly to the 11h35 debate with Rogério Santos,
Nuno Saraiva and moderator Sérgio Abrantes.
