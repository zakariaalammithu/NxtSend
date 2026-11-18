# Clay — Lead Enrichment

Status: **Implemented** (mock-tested; live use needs a real API key and an
operator-supplied routine id).

- Adapter: `src/lib/integrations/providers/enrichment/clay/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/clay/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/clay/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/ClayPanel.tsx`
- Docs: https://developers.clay.com

## Auth

- Base URL: `https://api.clay.com/public/v0`
- Header: `clay-api-key: <key>` (Clay dashboard → Settings → Account →
  API keys).
- Env var: `CLAY_API_KEY`.
- The Public API launched **9 July 2026** (verified against Clay's
  developer docs, 2026-11-19).

## Endpoints used

| Operation | Endpoint |
| --- | --- |
| Who am I | `GET /me` |
| Run a routine (inline, 1–100 items) | `POST /routines/{routine_id}/run` with `{ items: [{ id, inputs }] }` → `routine_run_id` |
| Poll run results | `GET /routines/run/{routine_run_id}/results` (202 while running, 200 when complete) |
| Batch runs | `/run-batch/upload-url` → PUT JSONL → `/run-batch/start` → poll `run-batch/{run_id}/results` |

Polling: 5-second interval, up to 24 attempts by default (injectable in
tests).

## How it works

Clay is a workflow platform, not an enrichment database: the operator
builds an enrichment routine in Clay and supplies its routine id. The
adapter never invents a routine id. Routine outputs are mapped generically
onto lead fields — known columns (email, job title, company, …) are matched
by name, everything else is preserved under
`custom_fields["enrichment_clay"]` with `source: "clay:<routineId>"`.

## Fields / credit model

- Fields depend entirely on the operator's routine; nothing is assumed.
- Confidence is `null` unless the routine output itself carries a
  confidence value.
- Clay's credit model is per-workspace (Clay credits); the adapter does
  not assert a per-call credit count and records usage only when the
  routine run reports it.

## Pending / config-ready

- The routine id must be supplied by the operator; there is no default.
- Batch (JSONL) runs are documented in the config but the adapter runs
  inline routines today; wire the batch flow if bulk volumes need it.
