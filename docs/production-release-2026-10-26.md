# Production release: 26 October 2026

## Live application and acceptance

Project commonwork-mvp (prj_gOblZZLo9FU3ExngHZNSg86WJkw0). Production database ydatgycmbcfzgythoppy. Accepted application commit 87a69567c82359857ad5fce3a3b50944a77b2c54, deployment dpl_5HKxGyj9vkQ8xSz7NxLmc4m4e3VS, promoted to commonwork.network under separate approval. Previous application deployment dpl_HUWvuR4u5VEFdVxQiLmqzzgfVV4d at 721e8c4e6ae71a5fec230615872b38276cdfa967 is the recorded application rollback target. Application rollback does not undo database migrations; the old signed-URL delivery path is not compatible with the new attendee Storage boundary.

Operator reported working sign-in/session persistence, navigation and event-resource acceptance on the candidate, followed by successful live-domain sign-in. Public resource hub, Events directory and Catalogue were independently fetched after promotion. This is not an independent security audit, exhaustive device test or proof that legacy cached URLs have been retired. Presentation-download PDF remains unavailable pending update. Subscription, membership application and event-registration forms remain deferred; email-enquiry labels are intentional.

Only event c3118b54-7568-4ef6-9159-124dc86e7971 / agentic-commerce-lisbon-2026 was explicitly opted into public resources and published. Storage remains private. The four existing Auth accounts received legacy workspace memberships under approval. Future Auth accounts do not automatically receive membership. Automatic custom-domain assignment was disabled and must not be silently restored. PR merge is a separate approval.

## Migration-history mapping: reconciliation still pending

The connector assigned execution-time versions to seven previously tracked migration bodies. Production list_migrations was checked before preparing this document. The mappings below must be reconciled before any automated database push. Do not re-execute these DDL bodies against Production, rename shared migration files or edit migration metadata without a separately approved, content-verified repair. Staging may use the original versions.

| Repository version | Production recorded version | Name |
| --- | --- | --- |
| 20261019070000 | 20261026164758 | workspace_access_registry |
| 20261019072000 | 20261026164914 | catalogue_workspace_boundary |
| 20261019080000 | 20261026165013 | member_data_workspace_boundary |
| 20261019083000 | 20261026165057 | member_feedback_projection |
| 20261019090000 | 20261026165149 | introduction_workspace_boundary |
| 20261019094000 | 20261026165213 | first_event_attendance_request |
| 20261019130000 | 20261026165359 | application_event_delivery |

The new 20261026174034_event_resource_server_read_columns.sql matches the recorded Production version and approved SQL. It was applied after the published resource hub failed because service_role lacked SELECT on both metadata tables. Only required-column SELECT was granted. Do not infer table-wide SELECT from these column grants. This repository commit does not apply it to staging.

The repository's 20261019111000_staging_authz_fixture_cleanup and 20261020090000_event_pass_foundation were deliberately not applied to Production. They are not silently approved by this release or documentation. A future database push must account for these pending migrations rather than automatically applying them.

Before repairing history: verify the exact linked project, inspect recorded statements against repository bodies, preserve a history export, review the seven one-to-one mappings and decide explicitly how the two deferred migrations are excluded from Production. Metadata reconciliation changes no application data and should not rerun DDL, but still requires separate approval. This document records the mapping; it does not claim repair completion.

## Favicon follow-up

This follow-up replaces the starter SVG with the existing Commonwork bracket geometry and adds versioned SVG icon declarations to all four HTML layouts. The legacy favicon.ico is not changed in this commit. Tests cover source declarations and public SVG delivery; browser-tab appearance and live deployment remain to be verified after CI and separate deployment approval.
