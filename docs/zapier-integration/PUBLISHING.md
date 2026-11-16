# Zapier Integration — Publishing

**Status: NOT published. NOT submitted. NOT claimed.**

The OAuth + REST + webhook surface is implemented and testable in
Zapier's developer platform, but no app has been submitted to
Zapier and Zapier has not approved anything. The app does not appear
in Zapier's app directory.

## The path (Zapier's process)

1. **Free review (~1 week).** Submit the app for Zapier's review.
   `zapier-platform validate` must pass (it does — exit 0, 27 checks,
   1 general warning D027 about core 19.3.0, intentionally not
   upgraded).
2. **90-day Beta.** The app is available to invited users.
3. **Public.** Listed in Zapier's directory.

## What Zapier requires before Public

- A **non-expiring test account** for
  integration-testing@zapier.com (owner step — a real NxtSend
  account the Zapier reviewers can use indefinitely).
- **Live Zaps with successful runs per trigger/action/search** —
  i.e. the PENDING live verification in [TESTING.md](TESTING.md)
  must be done first, against the deployed app.
- The App ID (and therefore the OAuth Redirect URL) **may change
  after publish/beta** — when it does, re-register the OAuth client
  with the new URL (one-time DCR call; see
  [AUTHENTICATION.md](AUTHENTICATION.md)).

## What NOT to do

- Do not run `zapier-platform register` / `push` / `promote`
  without the owner steps in [ZAPIER_SETUP.md](ZAPIER_SETUP.md) —
  they need the owner's Zapier developer account.
- Do not claim publication, approval, or directory listing until
  Zapier has actually granted it.
- Do not upgrade `zapier-platform-core` to 19.x to silence the D027
  warning without reviewing the major-version change separately.

## After publication (owner)

- Re-register the OAuth client if the App ID changed.
- Re-check the Integration Center Zapier page: the grant count and
  admin panel are the live proof the published app is being used.
- Keep the test account for integration-testing@zapier.com live —
  Zapier re-tests against it.
