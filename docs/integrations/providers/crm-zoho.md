# Zoho CRM — NxtSend CRM Integration

Status: **implemented, NOT live-verified**. No live call has been made against a real Zoho CRM account. Everything below is code-complete and mock-tested only.

## Auth setup

- Auth type: OAuth 2.0 access token, sent as `Authorization: Zoho-oauthtoken <token>` (the header Zoho's own docs use). Refresh via `POST https://accounts.zoho.com/oauth/v2/token`.
- Register a client in the Zoho Developer Console (API Console) with scopes `ZohoCRM.modules.leads.ALL` and `ZohoCRM.modules.notes.ALL`, and complete the OAuth flow. Store the access token (and refresh token) as the connection credential, encrypted in `integration_connections` (migration 030). No env var is read by the adapter code; `TOKEN_ENCRYPTION_KEY` is required by the shared token vault.
- Data centre: the default base is `https://www.zohoapis.com` (US). EU/IN/AU accounts use `zohoapis.eu` / `zohoapis.in` / `zohoapis.com.au` — set `extra.baseUrl` on the credential when the account is not US.

## Endpoints used (API v2, verified against zoho.com/crm/developer/docs)

| Operation | Endpoint |
|---|---|
| Connect test | `GET /crm/v2/Leads?per_page=1` |
| Import | `GET /crm/v2/Leads?per_page=` |
| Find by email | `GET /crm/v2/Leads/search?criteria=(Email:equals:<email>)` |
| Create | `POST /crm/v2/Leads` (`{data:[{…}]}`) |
| Update | `PUT /crm/v2/Leads/{id}` (`{data:[{…}]}`) |
| Note | `POST /crm/v2/Notes` (`{data:[{Note_Title, Note_Content, Parent_Id, se_module: "Leads"}]}`) |

Writes return per-record results (`status: "success"` / `"error"`); the adapter checks that status instead of trusting the HTTP code alone.

## Field mapping

| NxtSend | Zoho Lead field |
|---|---|
| email | `Email` |
| firstName | `First_Name` |
| lastName | `Last_Name` |
| company | `Company` (required on the Leads module — falls back to the person's name) |
| jobTitle | `Designation` |
| status | `Lead_Status` (see below) |

## Sync direction

**Two-way for Leads.** Import reads Leads into NxtSend leads (deduped by email); export creates or updates a Lead by email search. Status sync writes the `Lead_Status` picklist: `new` → `New`, `contacted`/`replied` → `Contacted`, `converted` → `Qualified`, `unresponsive` → `Not Contacted`. Notes attach to the Lead via the Notes module.

## What is config-ready vs pending

- Implemented: import, export, status sync, note sync, connect test, sync-job lifecycle, dedupe.
- NOT implemented: tag sync — Zoho Leads have no native tag field; the adapter throws an explicit error. The Contacts module is a follow-up (Leads only for now).
- Pending: live verification against a real account.
