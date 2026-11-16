# Permissions

## Scope tiers

Three prefixes, one meaning. `muse.read`, `nxtsend.read` and
`claude.read` grant exactly the same tier of access. The prefix
records which platform the grant belongs to; authorization decisions
go through `grantHasTier`, never through a string prefix check.

| Scope | Tier | What it allows |
|---|---|---|
| `claude.read` | read | Read leads, campaigns, sequences, inbox conversations, LinkedIn account health, subscription/limits, usage and performance. No changes are made. |
| `claude.write` | write | Create and change leads and draft campaigns; pause, resume, archive or stop campaigns; manage sequence steps and enrollments; generate AI drafts. Never sends anything. |
| `claude.send` | send | Send email and inbox replies, and permanently delete leads and campaigns. Every send needs approval in Claude each time. |

**Tiers are independent: `send` does NOT imply `write` or `read` — a
grant must hold each tier it needs.** A tool requires exactly one
tier; the mapping is in `src/lib/muse-connector/schemas.ts`
(`TOOL_SCOPES` / `requiredTier`):

- All 36 Read tools → read tier.
- All 14 Write tools → write tier.
- `send_email`, `send_inbox_reply` → send tier.
- `delete_lead`, `delete_campaign` → **write** tier (Sensitive-write
  classification is a Meta approval property, not a scope).

A requested scope must be a subset of the known scopes — anything
else is refused with `invalid_scope`, never silently dropped or
widened. When the client asks for no scope, the default is the
least-privilege scope for its platform: `claude.read`. The consent
screen recommends `claude.read` only, unless Claude genuinely needs
to change or send things.

## Plain-words scope descriptions (consent screen)

From `SCOPE_DESCRIPTIONS` in `src/lib/muse-connector/oauth/scopes.ts`:

- `claude.read` — "Read your leads, campaigns, inbox conversations
  and usage — no changes are made."
- `claude.write` — "Create and change leads and draft campaigns, and
  pause, resume or archive campaigns — never sends anything."
- `claude.send` — "Send email and inbox replies, and permanently
  delete leads. Every send needs your approval in Claude each time."

## Approval rules

- **Read / Write tools** default to "Ask on first use" in the host.
- **Sensitive write tools** (`send_email`, `send_inbox_reply`,
  `delete_lead`, `delete_campaign`) require approval **every time**
  and can never be set to "Always allow". This is a property of the
  classification, enforced by the host's approval model — the server
  also never auto-approves: every sensitive call is a separate,
  explicit tool call from Claude, and the server logs it.
- A tool combining reads and writes is a Write; a send/share/publish
  is never hidden inside a "read" — `get_conversation`'s read-marking
  is the one declared exception (see MCP_TOOLS.md).

## Missing-scope answer — and its honest caveat

When a grant lacks the tier a tool needs, the Claude flavor answers
with an HTTP 200 tool result (`isError: true`,
`code: "missing_scope"`, `structuredContent.status: "BLOCKED"`).
The message reads, for example:

> "This tool requires the `muse.write` scope, which the grant does
> not include."

**The message names the canonical `muse.write` scope, not
`claude.write`.** That is the adapter's `requiredScope()` /
`TIER_SCOPE` map in `src/lib/muse-connector/schemas.ts`: the error
names the canonical `muse.*` scope for the tier so existing callers
keep seeing the scope they asked for. The tier check itself
(`grantHasTier` in `src/lib/muse-connector/oauth/scopes.ts`) is
prefix-agnostic, so a `claude.write` grant **does** satisfy the write
tier — only the wording is Muse-flavoured. This is a cosmetic
inconsistency shared with the Muse flavor (and the same code path the
ChatGPT flavor bypasses with its structured reconnect prompt, which
Claude does **not** get — Claude gets the Muse-style error). It is
flagged in the final report as a known discrepancy, not silently
re-worded in these docs.

Practical effect: if Claude tells the user "grant the `muse.write`
permission", the user should grant **`claude.write`** on NxtSend's
consent screen — the same tier, the Claude prefix.

## Revocation

A user can revoke a grant at any time from the Claude detail page
(Dashboard → Integrations → Claude.ai (Anthropic) → "Your Claude
grants" → Revoke). Revoking removes Claude's access for that grant
immediately: every token for that client + user is revoked. Past audit
entries are kept. Removing the environment variables additionally
prevents *new* grants. An admin can also revoke from the admin
overview; refresh-token reuse revokes the whole grant automatically
(see SECURITY.md).
