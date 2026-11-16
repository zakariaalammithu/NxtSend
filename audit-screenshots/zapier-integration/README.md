# Zapier Integration — Screenshots to Capture (Live)

**No screenshots exist yet.** This folder contains no fabricated
screenshots: nothing here was captured against a live deployment,
because no live Supabase project and no Zapier developer account
were used from this environment. Capture the shots below live, in
order, once the owner steps in `docs/zapier-integration/ZAPIER_SETUP.md`
are done — then add the image files to this folder and tick each
item off.

## How to capture

- Use the deployed app (`https://nxtsend.com` in production) in
  live (Supabase) mode — never Demo Mode, which refuses the whole
  Zapier surface.
- Redact nothing by hand in the images, but check each shot for
  secrets before sharing: no token values, client secrets, or
  webhook HMAC secrets may appear (the UI never shows them; the
  Zapier dashboard's client-secret field must be masked in the
  shot).
- Name files as listed (`01-…png`, …) so the final report can
  reference them.

## Shots

1. `01-integration-center-zapier.png` — Integration Center list
   with the Zapier entry visible (status "Connected but Not
   Verified" before any grant, "Connected and Verified" after).
2. `02-detail-page-overview.png` — Zapier detail page: header,
   status badge, Live connection status section incl. the API health
   line (`mode: supabase`, `zapierEnabled: true`, version `1.0.0`),
   and the "Not published on Zapier" note.
3. `03-detail-page-endpoints-scopes.png` — Endpoints section (this
   deployment's URLs) and the Scopes section (`zapier.read` /
   `zapier.write`, read as recommended default, no `zapier.send`).
4. `04-detail-page-triggers-actions.png` — Triggers (polling 5 +
   instant 8), Actions (12), Searches (5) + dropdowns (4) sections.
5. `05-detail-page-grants.png` — "Your Zapier grants" panel with a
   real grant after connecting from Zapier (client name, scopes,
   Active badge, Revoke button — no token values visible).
6. `06-zapier-editor-auth.png` — Zapier editor: the NxtSend app's
   authentication setup (OAuth2, authorization/token URLs, scopes
   `zapier.read zapier.write`, resource URL) and a connected account.
7. `07-zapier-editor-trigger-select.png` — Zapier editor: trigger
   selection showing the polling and instant triggers (e.g. New Lead
   vs New Lead (Instant)).
8. `08-zapier-editor-action-select.png` — Zapier editor: action
   selection showing the 12 actions (e.g. Create Campaign with its
   draft-only note visible in the test step).
9. `09-example-zap-run.png` — A live Zap run: one polling trigger
   (e.g. New Lead) and one action (e.g. Create Lead) with a
   successful Task History entry.
10. `10-instant-trigger-delivery.png` — A live instant-trigger run:
    a dashboard lead creation firing New Lead (Instant) to a real
    `hooks.zapier.com` URL, with the Task History entry and (in the
    admin panel) the delivery marked delivered.
11. `11-webhook-subscriptions-admin.png` — Admin Zapier panel
    (`/admin/integrations/zapier`): active webhook subscriptions by
    event and the delivery counts.
12. `12-delivery-failure-admin.png` — Admin Zapier panel: a failed
    (or dead) delivery with its last error, after a forced failure
    (e.g. Zap turned off), showing the retry state.
13. `13-test-results.png` — Terminal output of `npm test` (full
    suite), `npx jest` in `integrations/zapier/` (60/60), and
    `npx zapier-platform validate` (exit 0, 27 checks passed).
14. `14-health-check-admin.png` — System Health page showing the
    `zapier` check (ok, with the grant count) alongside the
    muse/chatgpt/claude checks.

## Do not capture

- The client secret (shown once by DCR) — mask it if it is ever on
  screen.
- Any webhook HMAC secret or token value.
- Demo Mode screens presented as live verification.
