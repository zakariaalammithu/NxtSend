/**
 * CRM provider definitions — the 9 CRM definitions for the coordinator
 * to merge into the central registry (`../registry.ts`, which this
 * file deliberately does NOT edit).
 *
 * Honesty rules applied here:
 *  - `twoWaySync` is true ONLY where the provider API genuinely
 *    supports read + write of the same records (all 9 do, for
 *    contacts/records — with the per-provider caveats in each
 *    adapter's config).
 *  - Capabilities say "implemented, NOT live-verified" where the
 *    adapter exists but has never run against a real account, and
 *    name what is config-ready vs missing.
 *  - No definition claims a connection, a live sync, or a
 *    subscription tier.
 */

import type { ProviderDefinition } from "../types";

export const CRM_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "hubspot",
    name: "HubSpot",
    category: "crm",
    authType: "oauth2",
    docsUrl: "https://developers.hubspot.com/docs/api/crm/contacts",
    capabilities: [
      "Contacts: list, search by email, create, update, batch create (CRM API v3) — implemented, NOT live-verified",
      "Notes: create with inline contact association (associationTypeId 202, note_to_contact) — implemented, NOT live-verified",
      "Status sync via lifecyclestage property — implemented, NOT live-verified",
      "Auth: OAuth 2.0 access token or private-app access token (Bearer); tokens stored encrypted in integration_connections",
      "OAuth connect/callback routes NOT implemented — the shared OAuth handlers are typed to Google/Microsoft only; OAuth setup is documented and pending a shared-handler extension",
    ],
    twoWaySync: true,
    scopes: [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.companies.read",
      "crm.objects.companies.write",
    ],
  },
  {
    id: "salesforce",
    name: "Salesforce",
    category: "crm",
    authType: "oauth2",
    docsUrl: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_what_is_rest_api.htm",
    capabilities: [
      "Contacts: SOQL query, create, update via sObjects REST API v64.0 — implemented, NOT live-verified",
      "Tasks: create a Task linked to a Contact (WhoId) for activity logging — implemented, NOT live-verified",
      "Status sync NOT implemented: the Contact object has no status field; mapping to the Lead object is a follow-up",
      "Auth: OAuth 2.0 web-server flow against a Connected App (Bearer + per-org instance URL); tokens stored encrypted in integration_connections",
      "OAuth connect/callback routes NOT implemented — the shared OAuth handlers are typed to Google/Microsoft only; OAuth setup is documented and pending a shared-handler extension",
    ],
    twoWaySync: true,
    scopes: ["api", "refresh_token", "offline_access"],
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    category: "crm",
    authType: "oauth2",
    docsUrl: "https://developers.pipedrive.com/docs/api/v1/Persons",
    capabilities: [
      "Persons: list, search by term, create, update (API v1) — implemented, NOT live-verified",
      "Notes: create attached to a person (POST /v1/notes) — implemented, NOT live-verified",
      "Activities: create a note-type activity with the person as primary participant — implemented, NOT live-verified",
      "Status sync NOT implemented: Pipedrive persons have no status field; deal stages are a follow-up",
      "Auth: OAuth 2.0 access token (Bearer); tokens stored encrypted in integration_connections",
    ],
    twoWaySync: true,
  },
  {
    id: "close",
    name: "Close",
    category: "crm",
    authType: "api_key",
    docsUrl: "https://developer.close.com/api/overview",
    capabilities: [
      "Leads + nested contacts: list, create, update (API v1) — implemented, NOT live-verified",
      "Notes: create a note activity on a lead (POST /v1/activity/note/) — implemented, NOT live-verified",
      "Status sync via lead status lookup (GET /lead_status/ then PUT lead) — implemented, NOT live-verified",
      "Auth: API key via HTTP Basic Auth (key as username, empty password); stored encrypted in integration_connections",
    ],
    twoWaySync: true,
  },
  {
    id: "gohighlevel",
    name: "GoHighLevel",
    category: "crm",
    authType: "bearer_token",
    docsUrl: "https://marketplace.gohighlevel.com/docs/",
    capabilities: [
      "Contacts: list, search, create, update (API v2, Version: 2021-07-28 header) — implemented, NOT live-verified",
      "Status sync via a NxtSend status tag on the contact — implemented, NOT live-verified",
      "Notes and tag endpoints are CONFIG-READY only: the exact v2 paths were not verified against the official reference in this pass, so no request is sent",
      "Auth: Private Integration Token or OAuth access token (Bearer) + required locationId; stored encrypted in integration_connections",
    ],
    twoWaySync: true,
    scopes: ["contacts.readonly", "contacts.write"],
  },
  {
    id: "zoho",
    name: "Zoho CRM",
    category: "crm",
    authType: "oauth2",
    docsUrl: "https://www.zoho.com/crm/developer/docs/api/v2/insert-records.html",
    capabilities: [
      "Leads: list, search by email criteria, create, update (CRM API v2) — implemented, NOT live-verified",
      "Notes: create attached to a Lead (POST /crm/v2/Notes with Parent_Id + se_module) — implemented, NOT live-verified",
      "Status sync via the Lead_Status picklist — implemented, NOT live-verified",
      "Auth: OAuth 2.0 access token (Zoho-oauthtoken header, refresh via accounts.zoho.com); tokens stored encrypted in integration_connections",
    ],
    twoWaySync: true,
    scopes: ["ZohoCRM.modules.leads.ALL", "ZohoCRM.modules.notes.ALL"],
  },
  {
    id: "attio",
    name: "Attio",
    category: "crm",
    authType: "bearer_token",
    docsUrl: "https://developers.attio.com/docs",
    capabilities: [
      "People records: query, create, assert/upsert by email, update (API v2) — implemented, NOT live-verified",
      "Notes: create attached to a person record (POST /v2/notes) — implemented, NOT live-verified",
      "Status sync NOT implemented: Attio people records have no standard status field; list-stage mapping is a follow-up",
      "Auth: workspace access token (Bearer, scopes set at creation); stored encrypted in integration_connections",
    ],
    twoWaySync: true,
    scopes: ["record_permission:read-write", "note:read-write"],
  },
  {
    id: "breakcold",
    name: "Breakcold",
    category: "crm",
    authType: "api_key",
    docsUrl: "https://docs.breakcold.com/api/overview",
    capabilities: [
      "Records: list/search, create, update (REST API v1, objectTypeSlug 'person') — implemented, NOT live-verified",
      "Notes: create attached to a record (POST /records/{recordId}/notes) — implemented, NOT live-verified",
      "Status sync CONFIG-READY only: Breakcold records have no standard status field; the workspace's stage field slug must be configured first",
      "Auth: API key (Bearer, scopes records:read/write, notes:read/write); stored encrypted in integration_connections",
    ],
    twoWaySync: true,
    scopes: ["records:read", "records:write", "notes:read", "notes:write"],
  },
  {
    id: "monday",
    name: "Monday.com",
    category: "crm",
    authType: "api_key",
    docsUrl: "https://developer.monday.com/api-reference/",
    capabilities: [
      "Board items as leads: list via items_page, create via create_item, update via change_multiple_column_values (GraphQL API v2) — implemented, NOT live-verified",
      "Status sync via a status column (change_column_value) when configured — implemented, NOT live-verified",
      "Notes CONFIG-READY only: the create_update mutation was not verified in this pass, so no update is posted",
      "Auth: personal API v2 token (Authorization header, no Bearer prefix); stored encrypted in integration_connections",
    ],
    twoWaySync: true,
  },
];

export function getCrmProviderDefinition(id: string): ProviderDefinition | null {
  return CRM_PROVIDER_DEFINITIONS.find((d) => d.id === id) ?? null;
}
