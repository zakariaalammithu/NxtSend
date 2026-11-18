/**
 * Productivity provider definitions (Stage 6).
 *
 * Exported here — NOT appended to `./registry.ts` (the coordinator
 * merges these in). Capabilities are honest: anything config-ready
 * but not live-verified says so in the capability text itself.
 * Nothing here claims a connection.
 */

import type { ProviderDefinition } from "../types";

export const PRODUCTIVITY_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "google-sheets",
    name: "Google Sheets",
    category: "productivity",
    authType: "oauth2",
    docsUrl: "https://developers.google.com/workspace/sheets/api",
    capabilities: [
      "Export leads to a sheet (values.append) and import leads from a sheet (values.get), with field mapping and email dedupe",
      "Reuses the existing Google OAuth connection — the spreadsheets scope is requested by the Google OAuth flow (src/lib/oauth/config.ts GOOGLE_SCOPES); a stored Gmail-only grant must re-connect Google before a live connection works",
      "Config-ready: no live sheet has been connected from this environment; sync is mock-tested only",
    ],
    twoWaySync: true,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    category: "productivity",
    authType: "oauth2",
    docsUrl: "https://developers.google.com/workspace/drive/api",
    capabilities: [
      "Create a NxtSend Leads spreadsheet file in Drive, list Drive files, and import leads by exporting a sheet as CSV",
      "File-content upload (multipart / resumable) is NOT implemented: ProviderHttpClient sends JSON bodies only, so raw-byte upload has no transport in the engine",
      "Reuses the existing Google OAuth connection — the drive.file scope is requested by the Google OAuth flow (src/lib/oauth/config.ts GOOGLE_SCOPES); a stored Gmail-only grant must re-connect Google before a live connection works",
      "Config-ready: no live Drive account has been connected from this environment; sync is mock-tested only",
    ],
    twoWaySync: true,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  },
  {
    id: "airtable",
    name: "Airtable",
    category: "productivity",
    authType: "api_key",
    docsUrl: "https://airtable.com/developers/web/api/introduction",
    capabilities: [
      "Export leads to an Airtable table (up to 10 records per request, chunked) and import records, with field mapping and email dedupe",
      "Authenticates with a personal access token (legacy API keys were shut off 1 Feb 2024); scopes data.records:read / data.records:write",
      "Config-ready: no live Airtable base has been connected from this environment; sync is mock-tested only",
    ],
    twoWaySync: true,
    scopes: ["data.records:read", "data.records:write"],
  },
  {
    id: "notion",
    name: "Notion",
    category: "productivity",
    authType: "api_key",
    docsUrl: "https://developers.notion.com/reference/intro",
    capabilities: [
      "Export leads to a Notion database (create page, upsert by email) and import database rows, with field mapping and email dedupe",
      "Authenticates with an internal integration secret (Bearer token) + Notion-Version header; the database must be shared with the integration",
      "Config-ready: no live Notion database has been connected from this environment; sync is mock-tested only",
    ],
    twoWaySync: true,
  },
  {
    id: "monday",
    name: "Monday.com",
    category: "productivity",
    authType: "api_key",
    docsUrl: "https://developer.monday.com/api-reference/",
    capabilities: [
      "Export leads to a monday.com board as items (create_item) and import board items, with field mapping and email dedupe — productivity/task use only, NOT the CRM operations",
      "GraphQL API at api.monday.com/v2 with an API token; column ids are configurable per board",
      "Config-ready: no live monday.com board has been connected from this environment; sync is mock-tested only",
    ],
    twoWaySync: true,
  },
  {
    id: "asana",
    name: "Asana",
    category: "productivity",
    authType: "oauth2",
    docsUrl: "https://developers.asana.com/reference/rest-api-reference",
    capabilities: [
      "Create follow-up tasks from interested leads in an Asana project, and import tasks back to leads (best-effort: name + description lines the adapter wrote)",
      "Authenticates with a personal access token (Bearer) or OAuth; task creation requires the tasks:write scope",
      "Config-ready: no live Asana project has been connected from this environment; sync is mock-tested only",
    ],
    twoWaySync: true,
    scopes: ["tasks:write"],
  },
  {
    id: "trello",
    name: "Trello",
    category: "productivity",
    authType: "api_key",
    docsUrl: "https://developer.atlassian.com/cloud/trello/rest/",
    capabilities: [
      "Create follow-up cards from interested leads on a Trello list, and import cards back to leads (best-effort: name + description lines the adapter wrote)",
      "Authenticates with an API key + token passed as query parameters",
      "Config-ready: no live Trello board has been connected from this environment; sync is mock-tested only",
    ],
    twoWaySync: true,
  },
  {
    id: "clickup",
    name: "ClickUp",
    category: "productivity",
    authType: "api_key",
    docsUrl: "https://developer.clickup.com/reference",
    capabilities: [
      "Create follow-up tasks from interested leads in a ClickUp list, and import tasks back to leads (best-effort: name + description lines the adapter wrote)",
      "Authenticates with a personal API token (Bearer); one request per task (no bulk create endpoint)",
      "Config-ready: no live ClickUp list has been connected from this environment; sync is mock-tested only",
    ],
    twoWaySync: true,
  },
  {
    id: "jira",
    name: "Jira",
    category: "productivity",
    authType: "api_key",
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/",
    capabilities: [
      "Create follow-up issues from interested leads in a Jira Cloud project (ADF description) and import issues via JQL search, with field mapping",
      "Authenticates with email + API token (Basic auth); Jira Cloud only — Data Center uses the v2 API and is not covered",
      "Config-ready: no live Jira site has been connected from this environment; sync is mock-tested only",
    ],
    twoWaySync: true,
    scopes: ["read:jira-work", "write:jira-work"],
  },
  {
    id: "linear",
    name: "Linear",
    category: "productivity",
    authType: "api_key",
    docsUrl: "https://linear.app/developers",
    capabilities: [
      "Create follow-up issues from interested leads in a Linear team (issueCreate) and import issues, with field mapping",
      "GraphQL API at api.linear.app/graphql with a personal API key or OAuth token",
      "Config-ready: no live Linear workspace has been connected from this environment; sync is mock-tested only",
    ],
    twoWaySync: true,
  },
  {
    id: "calendly",
    name: "Calendly",
    category: "productivity",
    authType: "oauth2",
    docsUrl: "https://developer.calendly.com/api-docs",
    capabilities: [
      "List scheduled events and invitees, and generate a pre-filled scheduling link for a lead — Calendly API v2 cannot create events directly (booking happens on the scheduling link), so lead export is NOT supported",
      "Authenticates with OAuth 2.0 (or a personal access token for internal use)",
      "Config-ready: no live Calendly account has been connected from this environment; sync is mock-tested only",
    ],
    twoWaySync: false,
    scopes: ["scheduled_events:read", "scheduling_links:write"],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "productivity",
    authType: "oauth2",
    docsUrl: "https://developers.google.com/workspace/calendar/api",
    capabilities: [
      "Schedule follow-up events for interested leads (events.insert) and list upcoming events, with the lead's details in the event description",
      "Reuses the existing Google OAuth connection — the calendar.events scope is requested by the Google OAuth flow (src/lib/oauth/config.ts GOOGLE_SCOPES); a stored Gmail-only grant must re-connect Google before a live connection works",
      "Config-ready: no live calendar has been connected from this environment; sync is mock-tested only",
    ],
    twoWaySync: true,
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  },
];
