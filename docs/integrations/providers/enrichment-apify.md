# Apify — Lead Enrichment

Status: **Implemented** (mock-tested; live use needs a real API token and
an operator-chosen Store Actor).

- Adapter: `src/lib/integrations/providers/enrichment/apify/adapter.ts`
- Config: `src/lib/integrations/providers/enrichment/apify/config.ts`
- Tests: `src/lib/integrations/providers/enrichment/apify/__tests__/adapter.test.ts`
- Panel: `src/components/integrations/enrichment/ApifyPanel.tsx`
- Docs: https://docs.apify.com/api/v2

## Auth

- Base URL: `https://api.apify.com/v2`
- Header: `Authorization: Bearer <token>` (Apify Console → Settings →
  API & Integrations).
- Env var: `APIFY_TOKEN`.

## Endpoints used (verified against Apify's official API docs, 2026-11-19)

| Operation | Endpoint |
| --- | --- |
| Start an Actor run | `POST /acts/{actorId}/runs` (actor id as `username~actor-name`) |
| Poll run status | `GET /actor-runs/{runId}` — terminal states: `SUCCEEDED`, `FAILED`, `ABORTED`, `TIMED-OUT` |
| Read results | `GET /datasets/{datasetId}/items` |

The synchronous `run-sync-get-dataset-items` endpoint (up to 300s) exceeds
the Stage-1 client's 10-second timeout, so the adapter uses async runs +
polling (5-second interval, up to 60 attempts by default, injectable in
tests).

## How it works

Apify is a platform, not an enrichment database: the operator picks a
Store Actor and supplies its id + input. The adapter never invents an
Actor. Dataset items are mapped generically onto lead fields — known
columns by name, everything else preserved under
`custom_fields["enrichment_apify"]` with `source: "apify:<actorId>"`.

## Compliance rule (hard)

Apify must **never** be used to run an Actor that scrapes a service in
violation of that service's terms. The operator owns the Actor choice and
its legality; the adapter only runs what it is told to run.

## Fields / credit model

- Fields depend entirely on the chosen Actor; nothing is assumed.
- Confidence is `null` unless the dataset item itself carries one.
- Apify charges platform usage per its own pricing; the adapter does not
  assert a per-call credit count.

## Pending / config-ready

- The Actor id + input must be supplied by the operator; there is no
  default Actor.
