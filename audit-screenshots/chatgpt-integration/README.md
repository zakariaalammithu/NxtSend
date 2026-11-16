# Screenshots — ChatGPT integration

## Status: no screenshots yet (nothing fabricated)

No screenshots are included in this folder. Screenshots can only be
captured **live** — from the deployed site in a browser, and from a
real ChatGPT client after a successful connect — and no live ChatGPT
connect was possible from the build environment. Do not add mock-ups,
staged renders, or screenshots of other products here; a screenshot in
this folder must be a genuine capture of the listed screen, taken after
deploy, with the date it was taken noted in its filename or caption.

## Screenshots to capture (after deploy)

Take each one after the deployment in VERCEL_DEPLOYMENT.md is live,
with a real ChatGPT account and Developer Mode on. Save as PNG in
this folder.

1. `01-integration-center-chatgpt.png` — Dashboard → Integrations →
   ChatGPT entry showing "Connected but Not Verified" before any grant
   (configuration, not a connection).
2. `02-chatgpt-grants-panel.png` — The ChatGPT detail page's "Your
   ChatGPT grants" panel with one active grant, showing the
   `nxtsend.*` scopes **with their plain-words descriptions**.
3. `03-consent-screen.png` — NxtSend's OAuth consent screen as opened
   from ChatGPT, showing client name + origin + platform (ChatGPT) and
   the `nxtsend.read` recommended default.
4. `04-chatgpt-connected-tools-list.png` — ChatGPT's connector view
   showing NxtSend connected (tools/list, 54 tools).
5. `05-chatgpt-list-campaigns.png` — A ChatGPT conversation where
   `list_campaigns` returns real campaigns as text.
6. `06-campaigns-widget.png` — The campaigns widget rendered inside
   ChatGPT (`render_campaigns_widget` → `ui://widget/campaigns.html`).
   This is the UI verification that is currently PENDING — capture it
   as soon as a live render succeeds.
7. `07-missing-scope-prompt.png` — A tool call answered with the
   structured reconnect prompt (read-only grant calling a Write tool).
8. `08-admin-grants-by-origin.png` — Admin → Integrations → Muse.ai,
   "Grants by client origin" showing at least one ChatGPT grant.
9. `09-well-known-metadata.png` — `/.well-known/oauth-protected-resource`
   (or the authorization-server metadata) responding in the browser.
10. `10-revoke-grant.png` — The grants panel after revoking, showing
    the grant inactive and a subsequent ChatGPT tool call failing
    with 401.

## Naming

`NN-short-description.png`, in the order above. If a capture cannot be
taken (e.g. the plan does not offer Developer Mode), note that in the
final report instead of substituting a different image.
