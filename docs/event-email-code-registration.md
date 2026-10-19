# Event email-code registration: disabled candidate

Route: `/events/[slug]/join`. Ordinary invitation sign-in is unchanged and continues to send `shouldCreateUser: false`. The new route is default-off and hard-blocked when `VERCEL_ENV=production`. No environment variable or Auth setting is enabled by this commit.

## Server configuration required for a later staging review

- `COMMONWORK_EVENT_SIGNUP_ENABLED`: must be exactly `true`.
- `COMMONWORK_EVENT_SIGNUP_SIGNING_SECRET`: an independently generated secret of at least 32 bytes; never a PUBLIC_ variable or a committed value.
- `COMMONWORK_EVENT_SIGNUP_EVENT_IDS`: a nonempty comma-separated UUID allowlist. Every ID must parse; the event must also still be published.
- `COMMONWORK_EVENT_SIGNUP_TURNSTILE_SITE_KEY`: the public widget site key for the reviewed staging host.

Keep these unset in CI and all existing deployments for this checkpoint. Synthetic tests inject local configuration only into helper calls and mock the Auth API; no real registration emails are sent by these tests.

## Authorization and challenge behavior

The event is resolved from the database, not a posted event identifier. A signed 15-minute HttpOnly, SameSite=Lax cookie binds the normalized email to the canonical event ID and slug. HTTPS cookies are Secure. Resend requires the same valid scope and fresh CAPTCHA input. Verification uses the provider OTP and validates the authenticated confirmed email before returning to the canonical event page. Posted return paths and membership metadata are not used. Verification creates no attendance request, workspace grant, professional profile, affiliation or contact opt-in. Attendance still requires an explicit request and manager approval.

## Not ready for activation

CI covers helper gates, cookie tampering/expiry and the disabled HTTP path. It does not prove live CAPTCHA, SMTP delivery or complete new-user verification. Before enabling staging, review and test the boundary migrations, provider signup policy, OTP email template, CAPTCHA enforcement and provider rate limits. Enabling provider-wide CAPTCHA can affect ordinary sign-in; validate or implement that compatibility first. The widget alone is not CAPTCHA enforcement.

The application event allowlist does not restrict direct requests to Supabase Auth. Decide and validate an Auth-layer before-user-created policy if event-only account creation is required, rather than treating user metadata or this UI as authorization. Preserve disabled Production signup settings.

Existing event landing/sign-in links are not switched to the new route in this checkpoint. Add a conditional entry only after live staging validation. Production activation requires a separate code/configuration decision because of the hard block. No public signup activation, hosted migration, real-user test, merge or Production deployment is authorized by this document.
