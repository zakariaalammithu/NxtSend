# Workflow Templates — NxtSend × n8n

**Status: LANDED — Worker C delivered the 12 templates
(verified 2026-11-18 by reading
`integrations/n8n-nodes-nxtsend/workflows/`).** All 12 files
exist and are validated by `test/workflows.test.ts` (every file
must parse, reference only operations/events that exist in the
nodes, contain no secrets, and carry a Sticky Note explaining
setup). The package test suite passes 126/126 (see
[TESTING.md](TESTING.md)).

## The 12 templates

| File | Workflow | Trigger → action |
|---|---|---|
| `01-google-sheets-row-to-create-lead.json` | Google Sheets row → Create Lead | Google Sheets Trigger → Create Lead |
| `02-new-lead-to-google-sheets.json` | New Lead → Google Sheets | NxtSend Trigger (New Lead) → Append to Google Sheets |
| `03-crm-webhook-to-add-to-campaign.json` | CRM webhook → Add to Campaign | Webhook (CRM) → Add Lead to Campaign |
| `04-campaign-status-changed-to-slack.json` | Campaign Status Changed → Slack | NxtSend Trigger (Campaign Status Changed) → Notify Slack |
| `05-new-conversation-reply-to-slack.json` | New Conversation Reply → Slack | NxtSend Trigger (New Reply) → Notify Slack |
| `06-campaign-status-changed-to-email-alert-on-failed.json` | Campaign Status Changed → email alert on failed | NxtSend Trigger (Campaign Status Changed) → Is Failed? → Email Alert |
| `07-weekly-campaign-report-to-email.json` | Weekly campaign report → email | Weekly Schedule → Get Usage Report → Email Report |
| `08-form-submission-to-import-lead.json` | Form submission → Import Lead | Lead Form (webhook) → Import Lead |
| `09-new-lead-to-ai-personalization.json` | New Lead → AI personalization | NxtSend Trigger (New Lead) → AI Personalization (configure me) |
| `10-campaign-status-changed-to-google-sheets.json` | Campaign Status Changed → Google Sheets | NxtSend Trigger (Campaign Status Changed) → Update Google Sheets |
| `11-new-lead-to-slack.json` | New Lead → Slack | NxtSend Trigger (New Lead) → Notify Slack |
| `12-schedule-to-pause-campaign.json` | Daily schedule → Pause Campaign | Daily Schedule → Pause Campaign |

Note the destinations: Google Sheets, Slack, email, CRM webhook,
a form, and an AI step are the *external* tools in these
templates — NxtSend is the trigger/action side. Templates 02,
04, 05, 09, 10, 11 use the NxtSend Trigger; 01, 03, 08 use an
external trigger (Sheets / webhook / form) plus a NxtSend
action; 07 and 12 use n8n's Schedule trigger plus NxtSend
actions/searches.

## How to use a template

1. Import the `.json` into n8n (Workflows → Import from File).
2. Replace the placeholder NxtSend credential with your own
   (see [NODE_CREDENTIALS.md](NODE_CREDENTIALS.md)).
3. Replace the placeholder notification/CRM steps with your own
   tools — templates ship with the NxtSend side wired and the
   destination side as a clearly-marked placeholder.
4. Activate webhook-trigger templates — activation is what
   subscribes.

## Skipped templates (deliberate)

| Skipped template | Reason |
|---|---|
| LinkedIn connection-accepted → welcome | No event source: no authorized LinkedIn provider; the official LinkedIn API exposes no connection-request/DM endpoints to standard developers. |
| LinkedIn reply received → auto-reply | Same — no event source, and LinkedIn replies are refused 422 by design. |
| LinkedIn connection request sender | Same — no LinkedIn-send action exists. |

These are **not** deferred — they are refused by the product's
LinkedIn boundary. Do not build them as "manual" workarounds
that scrape or automate LinkedIn; that would violate the same
boundary the rest of the integration respects.

## Template honesty rules

- A template that creates a campaign must say the campaign is a
  **draft** and that launch happens in the NxtSend dashboard.
- A template that sends a reply must say the reply is
  **email-only**.
- No template may claim a LinkedIn step, a draft step, or
  date-range reporting.
