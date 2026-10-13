# Intent signals

Internal-only record of meaningful member actions, used to see genuine interest before anything is routed to CP Sales or Commerce Partners. Nothing here is exposed to members, and nothing syncs to an external system yet.

## Principles

- Record that an action happened, never its content. No need text, introduction text, evidence, contact details or free text.
- `properties` holds enums and identifiers only (limited to 512 bytes).
- Members cannot read, write or score events. The table, scoring views and recording function are service-role only; the only member-callable function records a catalogue view for the caller.
- Events are deleted with the profile (`on delete cascade`), so the account-deletion privacy flow removes them.
- Passive signals (opens, clicks, anonymous page views) are not stored here. The anonymous Commerce Partners click log stays in `commonwork_cta_events`.

## Event names

| Event | Status | Source | Subject | Properties |
| --- | --- | --- | --- | --- |
| `commonwork_account_created` | Captured | `profiles` insert trigger | profile | none |
| `commonwork_profile_completed` | Captured | `onboarding_completed` becomes true | profile | none |
| `commonwork_provider_viewed` | Captured | provider page, signed-in members; once per subject per 24 hours | provider | none |
| `commonwork_product_viewed` | Captured | product page, same rules | provider_product | none |
| `commonwork_need_created` | Captured | need becomes `active` (not draft save) | need | `visibility`, `has_retailer_organisation` |
| `commonwork_introduction_requested` | Captured | introduction leaves `draft` | introduction | `route` |
| `commonwork_event_registered` | Reserved | no event registration exists yet | n/a | n/a |
| `commonwork_membership_started` | Reserved | no membership or subscription exists yet | n/a | n/a |

Fields on `member_activity_events`: `profile_id`, `organisation_id` (primary affiliation when recorded), `event_name`, `subject_type`, `subject_id`, `properties`, `occurred_at`. Account, profile, need and introduction events are recorded once per subject.

## Scoring

`member_intent_scores` (view, 30-day window for behavioural parts). Total 0-100.

- **Fit (0-30):** primary organisation retailer +20, vendor or SI/GTM +10; at least one competence on the profile +10.
- **Value (0-30):** +5 per distinct provider or product viewed (cap 15); completed profile +15.
- **Intent (0-40, capped):** active need +20; introduction requested +15; two or more needs or introductions in the window +10.
- **Tiers:** 70 and above high, 40-69 medium, below 40 low.

`organisation_intent_scores` aggregates by primary organisation: member count, high-intent members and top member score.

The weights are deliberately simple and live in one migration so they can be tuned once real behaviour is seen. Titles, demographics and employer prestige are not used.

## Inspecting locally

```
npm run signals:report -- --tier=high --limit=25
```

Requires the same administrator configuration as the other operator scripts (`COMMONWORK_ADMIN_EMAIL` or `COMMONWORK_ADMIN_PROFILE_ID`) and asks for confirmation, because the output names members. Local data only unless `COMMONWORK_ENV` is set deliberately.

## Future CP Sales handoff (not built)

Proposed, pending a privacy-notice update and explicit member consent for sales follow-up:

| Sync candidate | Keep internal |
| --- | --- |
| `need_created` and `introduction_requested` at organisation level, as hand-raising signals | Individual provider or product views |
| High-tier organisation summaries | Per-member score components |
| `membership_started`, once it exists | Anything derived from private needs or introduction content |

Any handoff must be opt-in, minimal and reversible, and must not reveal a private need or introduction to a vendor or partner.
