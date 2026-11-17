# Screenshots — NxtSend × n8n Integration

No screenshots are included in this folder yet. **None have been
fabricated.** Screenshots are captured live from the deployed
site and a real n8n instance after deploy, and placed in this
folder then. Do not add mock-ups, stock images, or screenshots
from other integrations and label them as n8n.

## Screenshots to capture (after deploy)

Capture each one from the real deployment / real n8n instance,
at the point where the thing shown actually works:

1. **API-key settings** — Settings → Integrations → n8n →
   "API keys" section: the key list (name, prefix, scopes,
   created, last used), and the create-key form. (Do NOT
   screenshot a live key value — capture the list state, and the
   "copy it now" box with the value redacted.)
2. **Webhook settings** — the same page's "Webhook subscriptions
   + delivery status" section with at least one active
   subscription and one delivered delivery.
3. **n8n credential setup** — n8n's NxtSend API credential
   screen (API-key mode with Base URL filled; OAuth2 mode with
   the authorize/token URLs and scopes), showing a successful
   credential test.
4. **Node in panel** — the NxtSend node and the NxtSend Trigger
   in n8n's node panel / canvas after installing
   `n8n-nodes-nxtsend` (repo-path install until npm publish).
5. **Trigger operations** — the NxtSend Trigger's operation
   list (5 polling + 8 webhook triggers) in the node editor.
6. **Action operations** — the NxtSend node's action list (12
   actions) in the node editor.
7. **Search operations** — the node's search list (5 searches)
   plus a dynamic dropdown (e.g. Campaigns) populated from the
   live API.
8. **Dynamic fields** — a dropdown (Campaigns / Sequences with a
   campaign selected) showing live values from NxtSend.
9. **Example workflows** — one webhook-trigger workflow and one
   polling workflow, executed successfully (green executions).
10. **Webhook delivery** — an n8n execution triggered by a real
    NxtSend event, with the signed payload visible in the
    execution data (secret redacted).
11. **Admin monitoring** — Admin → Integrations → n8n: live
    overview with real grant / key / subscription / delivery
    counts (not "unknown").
12. **Test results** — the terminal output of `npm test` and
    `npm run build` passing for the n8n work (or the CI run
    showing the same).

## Naming

Save files as `01-api-key-settings.png`,
`02-webhook-settings.png`, `03-n8n-credential-setup.png`,
`04-node-in-panel.png`, `05-trigger-operations.png`,
`06-action-operations.png`, `07-search-operations.png`,
`08-dynamic-fields.png`, `09-example-workflows.png`,
`10-webhook-delivery.png`, `11-admin-monitoring.png`,
`12-test-results.png`, and list each file (with the date and
deployment it was captured from) in this README when it is
added.
