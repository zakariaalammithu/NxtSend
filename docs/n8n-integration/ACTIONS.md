# Actions — NxtSend node

The **NxtSend** node performs actions and searches. The node
package is **PARTIAL** (Worker C): the operation inventory below
is the contract's 12 actions, and the node's
`nodes/NxtSend/properties.ts` + `nodes/shared/constants.ts`
(OPERATION_ENDPOINTS) expose **more** operations than these 12 —
see "Beyond the 12" below. **Contact = Lead**
everywhere: Contact operations map to Lead endpoints.

## Actions (12)

| Action | Endpoint | Notes |
|---|---|---|
| Create Lead | `POST /v1/leads` | Deduped by email — a duplicate returns the existing lead with `duplicate: true`. |
| Update Lead | `PATCH /v1/leads/:id` | Includes status; emits `lead.updated` with `changed_fields`. |
| Import Leads | `POST /v1/leads/import` | Bulk, at most 100 rows per call; `skipped` covers invalid rows and duplicates. |
| Create Campaign | `POST /v1/campaigns` | **Draft only** — n8n cannot launch a campaign. At least one sequence step is required. A retried create can duplicate a draft (no natural dedup key). |
| Update Campaign | `PATCH /v1/campaigns/:id` | Name / type / description only. |
| Pause Campaign | `POST /v1/campaigns/:id/pause` | Needs an active campaign. |
| Resume Campaign | `POST /v1/campaigns/:id/resume` | Needs a paused campaign. |
| Stop Campaign | `POST /v1/campaigns/:id/stop` | Moves the campaign to archived — there is no stopped status. |
| Archive Campaign | `POST /v1/campaigns/:id/archive` | Refuses an already-archived campaign. |
| Add Leads to Campaign | `POST /v1/campaigns/:id/leads` | Returns `{enrolled, skipped, notFound}`. |
| Remove Lead From Campaign | `DELETE /v1/campaigns/:id/leads/:leadId` | Removes the enrollment; the lead record is kept. |
| Send Reply | `POST /v1/conversations/:id/replies` | **Email only** — LinkedIn replies are refused 422 by the server. `IdempotencyKey` replays a retried reply instead of sending twice. |

## Rules that catch people out

- **Campaign status transitions are strict.** Pause needs
  active, resume needs paused, stop archives, archive refuses
  archived. A wrong-state call fails — check the campaign's
  status first (Find Campaign).
- **Create Campaign is draft-only.** There is no launch action.
  Launch from the NxtSend dashboard. Any workflow that assumes
  a campaign starts sending after creation is wrong.
- **Create Campaign has no dedup key.** Retrying a timed-out
  create can produce two drafts. If the call times out, list
  campaigns and check before retrying.
- **Send Reply is email-only.** A LinkedIn reply is refused with
  422, by design. Email replies need no per-send approval in n8n.
- **Import Leads caps at 100 rows.** Split larger imports.
- **No draft action exists.** There is no draft concept in the
  product, so there is no Create Draft action.
- **No date-range reporting.** No date filter exists in the stats
  loaders, so there is no date-range report action.
- **Accepted is always null** in campaign performance — no data
  source exists for it, and it is never fabricated.

## Beyond the 12 (node operations — server routes LANDED)

The node exposes operations the contract's 12 do not list.
They are real in the node's `properties.ts` /
`OPERATION_ENDPOINTS` map, and **the v1 server routes they call
are all landed** (Worker A; the two `accounts/:id` routes landed
in the coordinator reconciliation pass):

| Node operation | Endpoint the node calls | Server status |
|---|---|---|
| Lead Delete | `DELETE /v1/leads/:id` | Landed |
| Lead Update Status | `PATCH /v1/leads/:id {status}` | Same as Update Lead |
| Sequence Get Sequence | `GET /v1/campaigns/:id/sequence` | Landed |
| Sequence Replace Steps | `POST /v1/campaigns/:id/steps` (full replace) | Landed |
| Sequence follow-ups (get / schedule / cancel / execution status) | `GET/POST/DELETE /v1/campaigns/:id/follow-ups[/:id]`, `GET /v1/campaigns/:id/execution-status` | Landed. Schedule Follow-Up sends the server's `ScheduleReplyInput` `{conversation_id, body, scheduled_at}` (snake_case, all required) — the node collects a conversation (dropdown), a time, and content; there is no step/subject in the server input. |
| LinkedIn Account Get | `GET /v1/accounts/:id` | Landed (coordinator pass) |
| LinkedIn Account Get Status | `GET /v1/accounts/:id/status` | Landed (coordinator pass). Returns `{account_status: {...}}`; `connected` is true only when the recorded `status` is `"connected"`. |
| Conversation Get Replies | `GET /v1/conversations/:id` | Same route as Get Conversation |
| Analytics (campaign/lead statistics, account activity, compare campaigns, usage report) | `GET /v1/campaigns/:id/performance`, `GET /v1/usage` (+ `GET /v1/leads` for counts) | Landed |

## Idempotency

- **Send Reply:** pass an `IdempotencyKey`. A retry with the same
  key replays the original reply instead of sending twice.
- **Create Lead:** deduped by email (duplicate returns the
  existing lead).
- **Create Campaign:** no dedup key — see above.
