# MCP Tools — the 18 tools

> **Verification note.** `platform.muse.ai/docs` itself was **not
> fetchable from this environment** — requirements were verified from
> Meta Help Center-derived implementation guides and from the code in
> this repo, and **must be re-checked live before submission**.
> Submission/approval is **NOT claimed**.

Source of truth: `src/lib/muse-connector/manifest.ts`
(`NXTSEND_TOOL_MANIFEST`) and `src/lib/muse-connector/schemas.ts`
(`TOOL_INPUT_SCHEMAS`, `TOOL_SCOPES`). The manifest is the
pre-classified draft; the MCP server serves exactly these 18 tools
(`tools/list`). Approval at Meta review would cover only approved
tools.

Endpoint: `POST /api/mcp` (Streamable HTTP, JSON-RPC 2.0,
`initialize` declares protocol `2025-06-18`). Auth: `Authorization:
Bearer <Muse access token>`; 401 + `WWW-Authenticate` when
missing/invalid. Scope enforcement per tool; **120 req/min per-grant
in-memory rate limit** (does not share across Vercel instances).
Demo Mode → 503 `not_configured`.

## Read (8) — no state change

| Tool | Required scope | Description | Inputs |
| --- | --- | --- | --- |
| `list_leads` | `muse.read` | List leads in the workspace (paginated, searchable). | query?, list/tag filters, page |
| `get_lead` | `muse.read` | One lead with tags, list membership, activity summary. | leadId |
| `list_campaigns` | `muse.read` | Campaigns with status, channel, enrollment counts. | status filter?, page |
| `get_campaign_activity` | `muse.read` | A campaign's execution/activity history. | campaignId, page |
| `list_conversations` | `muse.read` | Inbox conversations (email/LinkedIn) with unread state. | channel filter?, unreadOnly?, page |
| `get_conversation` | `muse.read` | One conversation's message history. **Marks the thread read**, matching the product UI. | conversationId |
| `get_usage_summary` | `muse.read` | Current plan, usage counters, limit headroom. | — |
| `get_integration_statuses` | `muse.read` | Integration Center statuses (presence only — no secret values). | — |

## Write (7) — creates/changes

| Tool | Required scope | Description | Inputs | Side effects |
| --- | --- | --- | --- | --- |
| `create_lead` | `muse.write` | Create a lead (deduplicated by email). | email, name?, company?, jobTitle?, tags? | Creates a lead row; may emit `lead.created` webhook. |
| `update_lead` | `muse.write` | Update a lead's fields, tags or list membership. | leadId, fields | Modifies the lead row. |
| `create_campaign` | `muse.write` | Create a draft campaign with sequence steps. **Never activates sending by itself.** | name, channel, steps[] | Creates a campaign in draft; may emit `campaign.created`. |
| `pause_campaign` | `muse.write` | Pause an active campaign (stops future steps). | campaignId | Status change; may emit `campaign.status_changed`. |
| `resume_campaign` | `muse.write` | Resume a paused campaign. Actual sending additionally depends on a connected, authorized provider. | campaignId | Status change; may emit `campaign.status_changed`. |
| `archive_campaign` | `muse.write` | Archive a campaign (reversible from the dashboard). | campaignId | Status change; may emit `campaign.status_changed`. |
| `draft_outreach_message` | `muse.write` | Generate an AI draft for human review in the sequence editor. Produces text only — it cannot send anything. | channel, stepType, campaign context, lead fields | Consumes AI provider quota; stores nothing unless the user saves the draft. |

## Sensitive write (3) — approval required every time, never "Always allow"

| Tool | Required scope | Description | Inputs | Side effects |
| --- | --- | --- | --- | --- |
| `send_email` | `muse.send` | Send one email through the workspace's configured provider. Suppression list is checked first and fails closed. | to, subject, body, workspace context | An email leaves the workspace's sending domain. Irreversible. |
| `send_inbox_reply` | `muse.send` | Send a reply inside an existing inbox conversation — **email channel only**. | conversationId, body, idempotencyKey | An email is sent and recorded with its provider message ID. Irreversible. |
| `delete_lead` | `muse.send` | Permanently delete a lead and its enrollments. | leadId | Data destruction — not recoverable from the product UI. |

## What is NOT in the tool list

- **No LinkedIn-send tool exists, by design.** LinkedIn-send tools
  are **NOT SUPPORTED**: no authorized LinkedIn provider exists for
  NxtSend, and the official LinkedIn API exposes no
  connection-request/DM endpoints to standard developers. LinkedIn
  campaign steps are recorded SKIPPED by the executor and LinkedIn
  replies are refused (HTTP 422) until an authorized provider is
  integrated.
- **No billing / money-movement tools.** The billing surface is kept
  out of the manifest entirely.
- **No tool combines a hidden send inside a "read".** A tool that
  reads and writes is classified Write; a send is always its own
  Sensitive-write tool.

## Notes

- `get_conversation` marks inbound messages read — the one Read tool
  with a visible state change, declared in its description.
- `send_inbox_reply` is email-only: a LinkedIn conversation reply
  through this tool is refused until an authorized LinkedIn provider
  exists.
- Every MCP tool call writes one audit entry (`muse.tool.<name>`)
  into `audit_logs` with `workspace_id` (see [SECURITY.md](SECURITY.md)).
