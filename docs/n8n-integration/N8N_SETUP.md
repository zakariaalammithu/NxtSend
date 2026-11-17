# n8n Setup — first workflow

## Prerequisites

- A running n8n instance you can reach (self-hosted or n8n
  Cloud) with admin access to install community nodes.
- A NxtSend account in **live mode** (Demo Mode refuses the
  whole n8n surface with 503).
- The NxtSend deployment with migrations 028 + 029 applied
  (written, not applied yet) and `TOKEN_ENCRYPTION_KEY` set (for
  OAuth; not needed for API-key-only use).

## 1. Install the community node

1. In n8n: **Settings → Community Nodes → Install**.
2. Enter `n8n-nodes-nxtsend`.
3. **The package is NOT on npm yet** (checked 2026-11-18: the
   name is available, nothing is published), so the directory
   install will fail until it is published. Until then, install
   from the repo path instead: clone the NxtSend repo and install
   from `integrations/n8n-nodes-nxtsend/` (the package builds
   cleanly — `npm run build` passes — and its README/AGENTS.md
   document the `n8n-node` CLI flow; use the package's own
   instructions, not a guessed command).
4. **Restart n8n** after installing a community node — the node
   does not appear until restart.

## 2. Create a credential in NxtSend

**API key (simplest):** NxtSend → Settings → Integrations → n8n
→ "Create a new API key". Name it (e.g. "Production n8n"),
tick `n8n.read` (and `n8n.write` only if the workflow changes
things), set an expiry if you want one, and **copy the key
immediately — it is shown exactly once**.

**OAuth2 (per-user):** register the client once via DCR, then
connect from n8n — see
[API_AUTHENTICATION.md](API_AUTHENTICATION.md) and
[NODE_CREDENTIALS.md](NODE_CREDENTIALS.md).

## 3. Create the credential in n8n

- **API key mode:** new credential → NxtSend API → Base URL
  `https://<your-domain>` (e.g. `https://nxtsend.com`) + the API
  key from step 2.
- **OAuth2 mode:** Authorization URL
  `https://<your-domain>/api/muse/oauth/authorize`, Token URL
  `https://<your-domain>/api/muse/oauth/token`, scopes
  `n8n.read n8n.write`, resource
  `https://<your-domain>/api/integrations/n8n`.

Test the credential. Green means the key/grant works — it does
not mean a workflow is connected.

## 4. First workflow (polling — no public URL needed)

1. Add an **NxtSend Trigger** (polling mode, "New Lead").
2. Add an **NxtSend** node → Find Lead (or any action).
3. Execute the workflow once manually. A new lead in NxtSend
   should appear as output on the next poll.
4. Activate the workflow.

## 5. First workflow (webhook — needs a public n8n URL)

1. Add an **NxtSend Trigger** (webhook mode, "New Lead").
   n8n shows the webhook URL it will listen on.
2. Activate the workflow — activation is what subscribes (the
   Trigger node calls `POST
   /api/integrations/n8n/webhooks/subscribe`).
3. Create a lead in NxtSend. The workflow should execute within
   seconds on the happy path.
4. Check the subscription on Settings → Integrations → n8n →
   "Webhook subscriptions + delivery status".

## 6. Verify the connection honestly

- Settings → Integrations → n8n shows the grant (OAuth) and/or
  the used API key and/or the active subscription. **If none of
  those three exists, nothing is connected** — no matter what
  the workflow canvas shows.
- The header status "Connected and Verified" comes from an OAuth
  grant only. An API-key-only connection is reported in the
  API-key panel, not in the header.
