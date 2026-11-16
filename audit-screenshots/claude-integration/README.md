# Screenshots — Claude integration

## Status: no screenshots yet (nothing fabricated)

No screenshots are included in this folder. Screenshots can only be
captured **live** — from the deployed site in a browser, and from a
real Claude client after a successful connect — and no live Claude
connect was possible from the build environment. Do not add mock-ups,
staged renders, or screenshots of other products here; a screenshot in
this folder must be a genuine capture of the listed screen, taken after
deploy, with the date it was taken noted in its filename or caption.

## Screenshots to capture (after deploy)

Take each one after the deployment in VERCEL_DEPLOYMENT.md is live,
with a real Claude account on a plan that offers custom connectors.
Save as PNG in this folder.

1. `01-integration-center-claude.png` — Dashboard → Integrations →
   Claude.ai (Anthropic) entry showing "Connected but Not Verified"
   before any grant (configuration, not a connection).
2. `02-claude-grants-panel.png` — The Claude detail page's "Your
   Claude grants" panel with one active grant, showing the
   `claude.*` scopes **with their plain-words descriptions**.
3. `03-consent-screen.png` — NxtSend's OAuth consent screen as opened
   from Claude, showing client name + origin + platform (Claude),
   the redirect hostname (claude.ai), and the `claude.read`
   recommended default.
4. `04-claude-connected-tools-list.png` — Claude's connector view
   showing NxtSend connected (tools/list, 54 tools).
5. `05-claude-list-campaigns.png` — A Claude conversation where
   `list_campaigns` returns real campaigns as text.
6. `06-claude-prompts.png` — Claude's prompts surface showing the 4
   NxtSend prompts (`campaign-performance-summary`,
   `lead-follow-up-draft`, `weekly-performance-report`,
   `duplicate-lead-cleanup`), and one `prompts/get` result rendered
   as a template message.
7. `07-claude-account-resource.png` — A Claude conversation where the
   `nxtsend://account` resource is read, showing user, workspace,
   client, grant, scopes and audience — and no plan.
8. `08-campaigns-widget.png` — The campaigns widget rendered inside
   Claude (`render_campaigns_widget` → `ui://widget/campaigns.html`).
   This is the UI verification that is currently PENDING — capture it
   as soon as a live render succeeds.
9. `09-missing-scope-error.png` — A tool call answered with the
   `missing_scope` error (read-only grant calling a Write tool),
   showing the message as Claude presents it (note: it names the
   canonical `muse.write` scope — see PERMISSIONS.md).
10. `10-admin-grants-by-origin.png` — Admin → Integrations → Muse.ai,
    "Grants by client origin" showing at least one Claude grant.
11. `11-well-known-metadata.png` —
    `/.well-known/oauth-protected-resource/api/mcp/claude` responding
    in the browser.
12. `12-revoke-grant.png` — The grants panel after revoking, showing
    the grant inactive and a subsequent Claude tool call failing
    with 401.

## Naming

`NN-short-description.png`, in the order above. If a capture cannot be
taken (e.g. the plan does not offer custom connectors), note that in
the final report instead of substituting a different image.
