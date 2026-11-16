# Tool Permissions & Classifications

> **Verification note.** `platform.muse.ai/docs` itself was **not
> fetchable from this environment** — requirements were verified from
> Meta Help Center-derived implementation guides and from the code in
> this repo, and **must be re-checked live before submission**.
> Submission/approval is **NOT claimed**.

## Classification scheme (Meta's, from the Connector guidelines)

| Classification | Meaning | Approval default |
| --- | --- | --- |
| **Read** | Retrieves data, no state change. | Ask on first use. |
| **Write** | Creates, changes or deletes; acts on the user's behalf. | Ask on first use. |
| **Sensitive write** | Irreversible or consequential (sending email, data destruction). | **Approval required EVERY time, never "Always allow".** |

Rules baked into the manifest (`src/lib/muse-connector/manifest.ts`):

- A tool combining reads and writes is a **Write**.
- A send/share/publish/payment must **never** be hidden inside a "read".
- Approval at Meta review covers **only the approved tools**.

## Counts (from the manifest — 18 tools)

- **Read: 8** — `list_leads`, `get_lead`, `list_campaigns`,
  `get_campaign_activity`, `list_conversations`, `get_conversation`,
  `get_usage_summary`, `get_integration_statuses`.
- **Write: 7** — `create_lead`, `update_lead`, `create_campaign`,
  `pause_campaign`, `resume_campaign`, `archive_campaign`,
  `draft_outreach_message`.
- **Sensitive write: 3** — `send_email`, `send_inbox_reply`
  (email-only), `delete_lead`.

## Scope mapping

Scopes are the OAuth-level grouping of the classes
(`src/lib/muse-connector/schemas.ts`: `TOOL_SCOPES`,
`requiredScope`):

| Scope | Unlocks |
| --- | --- |
| `muse.read` | All 8 Read tools. |
| `muse.write` | All 7 Write tools (+ Read, in practice — a grant's scopes are the union it was issued). |
| `muse.send` | All 3 Sensitive-write tools. |

Enforcement is server-side in `tools/call`: a token carrying only
`muse.read` **cannot** call a Write or Sensitive-write tool — the
call is refused, not silently downgraded. A requested scope outside
the three known scopes is refused at authorize time
(`invalid_scope`).

## The recommended default: `muse.read`-only

A **`muse.read`-only grant is the recommended default**, and the
consent screen offers it. It lets Muse look up leads, campaigns,
inbox conversations and usage without changing anything. Grant
`muse.write` only when Muse needs to create/change things, and
`muse.send` only when it needs to send email or delete leads — and
remember every send still needs approval in Muse each time.

## Sensitive-write rules (non-negotiable)

1. `send_email`: suppression list checked **first, fails closed** —
   if the suppression check cannot run, the send is refused.
2. `send_inbox_reply`: email channel only. A LinkedIn reply is
   refused until an authorized LinkedIn provider exists.
3. `delete_lead`: permanent, not recoverable from the product UI.
4. None of the three can be set to "Always allow" — approval is
   required **every time**.

## LinkedIn-send tools are NOT SUPPORTED

There is **no LinkedIn-send tool** in the manifest. The exact reason:
**no authorized LinkedIn provider exists** for NxtSend, and the
official LinkedIn API exposes **no connection-request/DM endpoints
to standard developers**. Until an authorized provider (a LinkedIn
partner API with its own compliance model) is procured and its
adapter implemented behind `src/lib/linkedin`, LinkedIn campaign
steps stay SKIPPED and LinkedIn replies stay refused (HTTP 422).
Adding a LinkedIn-send tool without that provider would be a false
claim, not a feature.

## Least privilege in practice

- One grant = one user + one workspace + the scopes approved on the
  consent screen. Grants are revocable per client from the
  Integration Center (Dashboard → Integration Center → Muse.ai →
  Your Muse grants) — revocation kills every token for that
  client + user immediately.
- Refresh tokens live 60 days; access tokens 1 hour. Rotation on
  every refresh; reuse of a rotated token revokes the whole grant.
- No billing / money-movement tools exist in the manifest at all.
