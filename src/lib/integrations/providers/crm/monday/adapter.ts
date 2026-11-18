/**
 * Monday.com adapter — ProviderHttpClient-based, mocked-only tests.
 *
 * The API is GraphQL: every call is POST to https://api.monday.com/v2
 * with `{ query, variables }`. Verified operations (see
 * ./config.ts): me, boards/columns, items_page, create_item,
 * change_multiple_column_values, change_column_value. No operation
 * in this file is guessed.
 *
 * Board/column mapping comes from the stored credential extras:
 * `extra.boardId` (required) and `extra.columns` (optional JSON
 * object {email, company, jobTitle, status} of column ids). Without
 * an email column, export cannot dedupe by email and always
 * creates; import still reads item names + whatever columns are
 * mapped.
 */

import type { ProviderCredential } from "../../connections";
import { toProviderError } from "../../client";
import {
  buildCrmClient,
  configReadyError,
  runCrmExport,
  runCrmImport,
  splitName,
  type CrmAdapter,
  type CrmAdapterDeps,
  type CrmLead,
  type CrmTestResult,
} from "../shared";
import { MONDAY_API_VERSION, MONDAY_BASE_URL, type MondayColumnMapping } from "./config";

interface MondayColumnValue {
  id: string;
  text?: string | null;
  value?: string | null;
}

interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

interface MondayGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

function boardIdOf(credential: ProviderCredential): string {
  const boardId = credential.extra?.boardId;
  if (!boardId) {
    throw new Error(
      "[monday] No boardId in the stored credential — save the Monday board id with the connection."
    );
  }
  return boardId;
}

function columnsOf(credential: ProviderCredential): MondayColumnMapping {
  const raw = credential.extra?.columns;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as MondayColumnMapping;
  } catch {
    return {};
  }
}

export function mondayClient(credential: ProviderCredential) {
  if (!credential.apiKey) {
    throw new Error("[monday] No API token in the stored credential.");
  }
  // Monday takes the raw token as the Authorization header value —
  // no "Bearer " prefix.
  return buildCrmClient(MONDAY_BASE_URL, () => ({
    Authorization: credential.apiKey as string,
    "API-Version": MONDAY_API_VERSION,
  }));
}

async function graphql<T>(
  client: ReturnType<typeof mondayClient>,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await client.request<MondayGraphqlResponse<T>>({
    method: "POST",
    path: "",
    body: { query, variables },
  });
  if (res.errors && res.errors.length > 0) {
    throw new Error(`[monday] GraphQL error: ${res.errors.map((e) => e.message).join("; ")}`);
  }
  if (!res.data) {
    throw new Error("[monday] GraphQL response had no data.");
  }
  return res.data;
}

function columnText(item: MondayItem, columnId: string | undefined): string | undefined {
  if (!columnId) return undefined;
  const col = item.column_values?.find((c) => c.id === columnId);
  return col?.text ?? undefined;
}

export function mondayItemToLead(
  item: MondayItem,
  columns: MondayColumnMapping
): CrmLead {
  const { firstName, lastName } = splitName(item.name ?? "");
  return {
    externalId: item.id,
    email: columnText(item, columns.email),
    firstName,
    lastName,
    company: columnText(item, columns.company),
    jobTitle: columnText(item, columns.jobTitle),
    status: columnText(item, columns.status),
    tags: [],
  };
}

export function leadToMondayColumnValues(
  lead: CrmLead,
  columns: MondayColumnMapping
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  // Monday column values are keyed by column id; text columns take
  // a plain string, email columns take {email, text}.
  if (columns.email && lead.email) {
    values[columns.email] = { email: lead.email, text: lead.email };
  }
  if (columns.company && lead.company) values[columns.company] = lead.company;
  if (columns.jobTitle && lead.jobTitle) values[columns.jobTitle] = lead.jobTitle;
  if (columns.status && lead.status) values[columns.status] = { label: lead.status };
  return values;
}

async function findItemByEmail(
  client: ReturnType<typeof mondayClient>,
  boardId: string,
  columns: MondayColumnMapping,
  email: string
): Promise<MondayItem | null> {
  if (!columns.email) return null;
  const data = await graphql<{ boards: Array<{ items_page: { items: MondayItem[] } }> }>(
    client,
    `query ($boardId: [ID!]!, $limit: Int!) {
      boards(ids: $boardId) {
        items_page(limit: $limit) {
          items { id name column_values { id text value } }
        }
      }
    }`,
    { boardId: [boardId], limit: 100 }
  );
  const items = data.boards?.[0]?.items_page?.items ?? [];
  return (
    items.find(
      (item) => columnText(item, columns.email)?.toLowerCase() === email.toLowerCase()
    ) ?? null
  );
}

export function createMondayAdapter(): CrmAdapter {
  const provider = "monday";
  const adapter: CrmAdapter = {
    provider,

    async testConnection(credential): Promise<CrmTestResult> {
      try {
        const client = mondayClient(credential);
        const data = await graphql<{ me: { id: string; name?: string } }>(
          client,
          `query { me { id name } }`,
          {}
        );
        return {
          ok: true,
          detail: `Monday.com reachable${data.me.name ? ` as ${data.me.name}` : ""}.`,
        };
      } catch (err) {
        return { ok: false, detail: toProviderError(err).message };
      }
    },

    async importContacts(credential, opts): Promise<CrmLead[]> {
      const client = mondayClient(credential);
      const boardId = boardIdOf(credential);
      const columns = columnsOf(credential);
      const data = await graphql<{ boards: Array<{ items_page: { items: MondayItem[] } }> }>(
        client,
        `query ($boardId: [ID!]!, $limit: Int!) {
          boards(ids: $boardId) {
            items_page(limit: $limit) {
              items { id name column_values { id text value } }
            }
          }
        }`,
        { boardId: [boardId], limit: Math.min(opts?.limit ?? 100, 100) }
      );
      const items = data.boards?.[0]?.items_page?.items ?? [];
      return items.map((item) => mondayItemToLead(item, columns));
    },

    async exportLead(credential, lead) {
      const client = mondayClient(credential);
      const boardId = boardIdOf(credential);
      const columns = columnsOf(credential);
      const itemName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unknown";
      if (lead.email) {
        const existing = await findItemByEmail(client, boardId, columns, lead.email);
        if (existing) {
          const columnValues = leadToMondayColumnValues(lead, columns);
          if (Object.keys(columnValues).length > 0) {
            await graphql(
              client,
              `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
                change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
              }`,
              {
                boardId,
                itemId: existing.id,
                columnValues: JSON.stringify(columnValues),
              }
            );
          }
          return { externalId: existing.id, created: false };
        }
      }
      const columnValues = leadToMondayColumnValues(lead, columns);
      const data = await graphql<{ create_item: { id: string } }>(
        client,
        `mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
          create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) { id }
        }`,
        {
          boardId,
          itemName,
          columnValues: JSON.stringify(columnValues),
        }
      );
      return { externalId: data.create_item.id, created: true };
    },

    async syncLeadStatus(credential, externalId, status) {
      const client = mondayClient(credential);
      const boardId = boardIdOf(credential);
      const columns = columnsOf(credential);
      if (!columns.status) {
        throw new Error(
          "[monday] No status column is configured — set extra.columns.status to the status column id first."
        );
      }
      await graphql(
        client,
        `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
          change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
        }`,
        {
          boardId,
          itemId: externalId,
          columnId: columns.status,
          value: JSON.stringify({ label: status }),
        }
      );
    },

    async syncTags() {
      throw configReadyError(
        "monday",
        "tag sync",
        "Monday boards have no native tag field; tags would need a dedicated Tags column configured per board."
      );
    },

    async syncNote() {
      throw configReadyError(
        "monday",
        "note sync",
        "the create_update mutation was not verified against the official Monday GraphQL reference in this pass."
      );
    },

    async runImport(deps: CrmAdapterDeps, opts) {
      return runCrmImport(adapter, deps, opts);
    },

    async runExport(deps: CrmAdapterDeps, leads: CrmLead[]) {
      return runCrmExport(adapter, deps, leads);
    },
  };
  return adapter;
}
