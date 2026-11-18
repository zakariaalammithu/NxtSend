# RB2B — Lead Enrichment (webhook-only)

Status: **Implemented as pure payload mapping** (no network; live use
needs the webhook wired in RB2B). RB2B has no pull API.

- Adapter: `src/lib/integrations/providers/enrichment/rb2b/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/rb2b/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/rb2b/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/Rb2bPanel.tsx`
- Docs: https://support.rb2b.com/

## How it works

RB2B identifies anonymous website visitors and pushes their data to
NxtSend as an **outbound webhook per page view**. There is no endpoint
NxtSend can call to fetch a visitor — the adapter is pure mapping
(`rb2bPayloadToResult`, `rb2bPayloadToLeadPatch`), and `enrichLead` /
`enrichCompany` / `findEmail` / `bulkEnrich` all throw
`provider_operation_unsupported`.

## Payload fields (per RB2B's documented webhook payload)

Email, first/last name, job title, company, LinkedIn URL, city/state,
industry, revenue, employee count, pages visited, tags. Mapped onto lead
fields with `source: "rb2b"`; known columns written directly, the rest
under `custom_fields["enrichment_rb2b"]`.

## Auth / security

- No API key. The only documented public API is the **OEM partner API**
  (domain management + credit usage), which is partner-only.
- RB2B sends **no HMAC** on outgoing webhooks — the destination URL is
  treated as a shared secret. Env var: `RB2B_WEBHOOK_SECRET`.
- US traffic only: no EU/UK visitor resolution (GDPR).

## Credit model

RB2B credits are consumed on its own side per identified visitor; the
adapter records 0 credits (nothing is charged by a NxtSend-side call,
because there is none).

## Pending / config-ready

- The inbound webhook endpoint that receives RB2B's push and calls
  `rb2bPayloadToLeadPatch` is coordinator work (outside this partition).
- Nothing here claims a live RB2B connection until a real webhook has
  been received.
