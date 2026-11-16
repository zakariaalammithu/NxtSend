# Permissions

## Scopes

Canonical ChatGPT scopes (the `nxtsend.*` set). The Muse scopes
(`muse.*`) are aliases with identical tiers — the prefix records which
platform the grant belongs to, never extra privilege. Authorization
decisions go through `grantHasTier(scopes, tier)` in
`src/lib/muse-connector/oauth/scopes.ts`, never through a string
prefix check.

| Scope | Tier | Plain-words description (shown on the consent screen and the grants panel) |
|---|---|---|
| `nxtsend.read` | read | Read your leads, campaigns, inbox conversations and usage — no changes are made. |
| `nxtsend.write` | write | Create and change leads and draft campaigns, and pause, resume or archive campaigns — never sends anything. |
| `nxtsend.send` | send | Send email and inbox replies, and permanently delete leads. Every send needs your approval in ChatGPT each time. |
| `muse.read` | read | Read your leads, campaigns, inbox conversations and usage — no changes are made. |
| `muse.write` | write | Create and change leads and draft campaigns, and pause, resume or archive campaigns — never sends anything. |
| `muse.send` | send | Send email and inbox replies, and permanently delete leads. Every send needs your approval in Muse each time. |

`SCOPE_DESCRIPTIONS` in `src/lib/muse-connector/oauth/scopes.ts` is
the single source for these descriptions. The Integration Center
grants panel renders each granted scope with its description — both
prefixes, not just `muse.*`.

## Tier independence

Tiers are independent: **`send` does NOT imply `write` or `read`**.
A grant must hold each tier it needs. Examples:

- `nxtsend.read` alone: all 36 Read tools, nothing else.
- `nxtsend.read + nxtsend.write`: reads + the 14 Write tools.
- `nxtsend.send` alone: **cannot call any Read or Write tool** — only
  the 4 Sensitive write tools (and even those need per-action approval
  in ChatGPT).

The recommended default on the consent screen is `nxtsend.read` only
(least privilege). A requested scope outside the six known scopes is
refused with `invalid_scope`, never silently dropped or widened.

## What each tier allows (tool level)

| Tier | Tools | Notes |
|---|---|---|
| read | 36 Read tools (MCP_TOOLS.md) | Includes `get_profile`, `search`, `fetch`, `render_campaigns_widget`. `get_conversation` marks the thread read (declared). |
| write | 14 Write tools | Create/update leads, draft-only campaigns, pause/resume/archive/stop campaigns, sequence steps, enrollments. `create_campaign` is draft-only — creating a campaign never activates sending. `draft_outreach_message` produces text only. |
| send | 4 Sensitive write tools | `send_email`, `send_inbox_reply` (email only), `delete_lead`, `delete_campaign`. Every call needs explicit approval in ChatGPT each time. |

## Approval rules

- **Sensitive writes: approval every time.** There is no "Always allow"
  for `send_email`, `send_inbox_reply`, `delete_lead` or
  `delete_campaign` — the MCP `initialize` instructions and the consent
  copy both say so.
- **Destructive actions need explicit confirmation.** The server
  instructions (first 512 chars) tell the model to confirm IDs before
  mutating and to get explicit confirmation for destructive actions.
- **LinkedIn sends: no approval flow exists because no tool exists.**
  See MCP_TOOLS.md — NOT SUPPORTED.

## Grant lifecycle (user-facing)

- A grant is one client + user pair. It is **active** while it holds at
  least one non-revoked, unexpired refresh token (60 d).
- Grants are listed per platform on the Integration Center detail page
  (Dashboard → Integrations → ChatGPT → "Your ChatGPT grants") with
  scopes + descriptions, creation time and refresh-token expiry.
  "Last used" is **not tracked** (migration 023 stores no last-used
  time) and is shown as such — never invented.
- Revoking a grant (from the panel, or via RFC 7009 revocation) removes
  access immediately: every token for that client + user is revoked.
- A grant is scoped to one user and one workspace, and bound to one
  MCP resource (RFC 8707). Cross-workspace and cross-platform token
  use is refused.

## What ChatGPT cannot do, even with `nxtsend.send`

- Send LinkedIn connection requests or messages (no tool exists).
- Send a LinkedIn inbox reply (`send_inbox_reply` is email-only;
  LinkedIn replies stay refused until an authorized provider exists).
- Read or change another workspace's data.
- Use a token issued for `/api/mcp` on `/api/mcp/chatgpt` (or vice versa).
- See token values, secrets, or any other user's grants.
