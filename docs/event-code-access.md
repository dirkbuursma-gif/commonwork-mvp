# Event-code access: staged implementation

Goal: event link plus a shared code opens only that event's materials. No member account, email verification or manual attendee approval is required for this path. Newsletter subscription is optional and independent. A code may be forwarded; it is not verified attendance or an identified registration list.

## Foundation only

This commit adds server-only code hashing and signed pass primitives, offline test cases and an UNAPPLIED migration. It does not change routes, enable code access, create a code, send emails, apply database changes or deploy. Existing video delivery and member access stay intact.

## Required route integration before activation

- Load a published event and its enabled code binding from trusted server storage. Clients must never read code hashes or attempt records directly.
- POST codes in the request body, not URLs. Check same-origin submission and shared database-backed attempt limits before scrypt verification. Derive rate-limit bucket hashes with a server secret and trusted deployment client-IP handling; do not trust arbitrary forwarded headers or store raw IPs. Expired attempt records need bounded scheduled cleanup.
- Use an independently generated signing secret of at least 32 random bytes. COMMONWORK_VIDEO_SECRET_KEY is a Storage credential, not a pass-signing secret. Never log codes, hashes, signing keys or pass cookies.
- Issue event-scoped cookies with Secure, HttpOnly, SameSite=Lax, Path=/ and a lifetime no longer than 24 hours or the event expiry. Clear the cookie to leave event access. Each protected page, PDF and video request must reload the published event/code binding and verify its event, version and expiry. Disabling/rotating code configuration changes the version and invalidates existing passes on subsequent requests.
- Keep resource resolution bound to the authorized event; no arbitrary bucket/path forwarding. Preserve current private Storage delivery, byte-range support and COMMONWORK_VIDEO_SECRET_KEY. Do not grant workspace membership or create attendee/profile records when a code is redeemed. Event management remains member/manager-only.
- Render the same optional email-updates form for readers regardless of membership. Reuse audience_contacts and explicit consent recording where suitable; first verify the actual subscription and withdrawal workflow. Never label subscription successful without a persisted result, silently enroll users or make content depend on subscribing. Existing commonwork_interest consent also records membership interest, so do not reuse that scope blindly for a simple newsletter opt-in.

## Before Production

Run the helper and database tests; then test anonymous code entry, wrong-code throttling, cross-event denial, expiry/rotation, video playback/seeking, downloads, management denial and optional subscription/withdrawal. Offline helper tests alone do not prove any hosted route or database behavior. Review dependent branches and migrations against main, preserve public Insights/reviews and private workspace boundaries, and obtain separate approval for schema application, code provisioning, secrets and Production deployment.
