/**
 * Shared REST API v1 — route logic over injected repositories
 * (Zapier + n8n, one implementation).
 *
 * Thin Next.js route files (src/app/api/integrations/<platform>/v1/*)
 * resolve auth + build these deps and call one function here, so
 * the whole API is unit-testable against the repo fakes with no
 * database and no network. Every function returns a
 * `{status, body}` pair; errors follow the REST convention
 * (`{error}`) plus a `code` field where it helps the caller tell
 * failures apart. Which platform a call came from is
 * `deps.platform` — response shapes, validation and error codes
 * are identical for Zapier and n8n; only audit actions/resources
 * (`<platform>.*` / `<platform>:…`), the emit `source`, and the
 * platform-aware messages differ.
 *
 * Rules, preserved from the rest of the product:
 *  - Workspace isolation: every read/write re-checks the
 *    workspace_id from the token. `updateLead` takes no workspace
 *    param, so ownership is verified via `getLeadById` first.
 *  - Campaigns are created DRAFT ONLY, like the MCP adapter —
 *    there is no server-side wizard launch validation to reuse
 *    (launch checks live in the dashboard wizard), so neither
 *    platform can launch a campaign directly. Pause requires active,
 *    resume requires paused, stop/archive requires not-already-
 *    archived — the same `requiredFrom` rules the MCP adapter
 *    enforces.
 *  - Lead creates dedup by email (case-insensitive) and return
 *    `{lead, duplicate: true}` instead of creating a second row.
 *  - `accepted` in campaign performance is always null — no data
 *    source exists for it, and it is never fabricated.
 *  - Inbox replies go through the existing `sendInboxReply`
 *    (email channel only; LinkedIn refused 422; idempotencyKey
 *    required, duplicates replayed, never re-sent).
 *  - No LinkedIn-send actions, triggers or events exist anywhere
 *    in this API.
 *  - Polling lists are newest-first with a stable `id` on every
 *    item; `after` is an exclusive ISO timestamp cursor on the
 *    order key.
 *  - Lead DELETE exists only on the n8n routes (the Zapier routes
 *    do not expose it). The function itself is generic; the route
 *    decides.
 *  - Sequence steps + scheduled follow-ups are n8n-only routes.
 *    Scheduled replies are workspace-scoped in the data model
 *    (no campaign link exists), so the campaign segment of those
 *    routes only verifies the campaign exists.
 */

import type {
  Campaign,
  CampaignStatus,
  CampaignStep,
  CampaignType,
  Lead,
  StepType,
} from "@/types";
import type { MuseAccessContext } from "@/lib/muse-connector/oauth/tokens";
import type { LeadsRepository, CreateLeadInput } from "@/lib/data/leads";
import { getLeadById, searchLeads } from "@/lib/data/leads";
import type { CampaignsRepository, CreateCampaignInput, CampaignStepDraft } from "@/lib/data/campaigns";
import type { InboxRepository } from "@/lib/data/inbox";
import { isValidEmailAddress } from "@/lib/data/inbox";
import type { AccountsRepository } from "@/lib/data/accounts";
import type { UsageRepository } from "@/lib/data/usage";
import type { ScheduledRepliesRepository } from "@/lib/data/scheduled-replies";
import {
  loadCampaignStats,
  loadCampaignExecutions,
  type CampaignStatsDeps,
} from "@/lib/data/campaign-stats";
import type { DataMode } from "@/lib/data/mode";
import { normalizeEmail } from "@/lib/data/duplicates";
import type { SendReplyArgs, ReplyOutcome } from "@/lib/inbox/reply";
import type { WebhookEventType } from "./events";
import {
  publicSubscription,
  subscribePlatformWebhook,
  unsubscribePlatformWebhook,
  type WebhookOutboxStore,
  type WebhookSubscriptionStore,
} from "./outbox";
import type { PlatformConfig } from "./config";

export interface RestApiDeps {
  /** Which platform the call came from — drives audit, emit source and messages. */
  platform: PlatformConfig;
  leads: LeadsRepository;
  campaigns: CampaignsRepository;
  inbox: InboxRepository;
  accounts: AccountsRepository;
  usage: UsageRepository;
  /** Scheduled-reply repo (n8n follow-up routes). Optional so the
   * Zapier compat adapter, which has no follow-up routes, can omit
   * it — the follow-up functions answer 503 without it. */
  scheduledReplies?: ScheduledRepliesRepository;
  mode: DataMode;
  store: WebhookSubscriptionStore & WebhookOutboxStore;
  /** Server-side emit (enqueue + best-effort immediate attempt). */
  emit: (type: WebhookEventType, workspaceId: string, data: Record<string, unknown>) => Promise<void>;
  /** Inbox reply send path (defaults to the real sendInboxReply in the route helper). */
  sendReply: (args: SendReplyArgs) => Promise<ReplyOutcome>;
  getUserLabel: (userId: string) => Promise<{ id: string; email: string | null } | null>;
  getWorkspaceLabel: (workspaceId: string) => Promise<{ id: string; name: string | null } | null>;
  audit: (input: {
    workspaceId: string | null;
    actorId: string | null;
    /** Bare action, e.g. `lead_created` — the route helper prefixes it with the platform. */
    action: string;
    resource: string;
    details: string;
  }) => Promise<void>;
}

/** Display name for the platform in human-readable audit details. */
function apiLabel(deps: RestApiDeps): string {
  return deps.platform.platform === "n8n" ? "n8n" : "Zapier";
}

export interface RestApiResult {
  status: number;
  body: Record<string, unknown>;
}

function ok(body: Record<string, unknown>, status = 200): RestApiResult {
  return { status, body };
}

function err(status: number, error: string, code: string): RestApiResult {
  return { status, body: { error, code } };
}

const notFound = (what: string): RestApiResult =>
  err(404, `${what} not found in this workspace.`, "not_found");

const LEAD_STATUSES = ["new", "contacted", "replied", "converted", "unresponsive"] as const;
const VALID_STEP_TYPES: StepType[] = [
  "connection_request",
  "linkedin_message",
  "email",
  "wait",
  "condition",
  "like_post",
  "view_profile",
  "endorse_skills",
];
const VALID_CAMPAIGN_TYPES = ["linkedin", "email", "mixed"] as const;
const CAMPAIGN_STATUSES: CampaignStatus[] = ["draft", "active", "paused", "archived"];

/** Parses limit (default 50, max 100) and the `after` ISO cursor. */
export function parseListParams(query: URLSearchParams): {
  limit: number;
  after: string | null;
  order: "created_at_desc" | "updated_at_desc";
  error?: RestApiResult;
} {
  const rawLimit = query.get("limit");
  let limit = 50;
  if (rawLimit !== null) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      return {
        limit,
        after: null,
        order: "created_at_desc",
        error: err(400, "limit must be an integer between 1 and 100.", "invalid_limit"),
      };
    }
    limit = parsed;
  }
  const after = query.get("after");
  if (after !== null && Number.isNaN(Date.parse(after))) {
    return {
      limit,
      after: null,
      order: "created_at_desc",
      error: err(400, "after must be an ISO 8601 timestamp.", "invalid_cursor"),
    };
  }
  const order =
    query.get("order") === "updated_at_desc" ? "updated_at_desc" : "created_at_desc";
  return { limit, after, order };
}

function leadSortKey(lead: Lead, order: "created_at_desc" | "updated_at_desc"): string {
  if (order === "updated_at_desc") return lead.updated_at ?? lead.created_at;
  return lead.created_at;
}

/** Newest-first, exclusive `after` cursor on the order key. */
function paginateLeads(
  leads: Lead[],
  limit: number,
  after: string | null,
  order: "created_at_desc" | "updated_at_desc"
): Lead[] {
  const sorted = [...leads].sort((a, b) =>
    leadSortKey(b, order).localeCompare(leadSortKey(a, order))
  );
  const filtered =
    after === null ? sorted : sorted.filter((l) => leadSortKey(l, order) < after);
  return filtered.slice(0, limit);
}

function serializeLead(lead: Lead): Record<string, unknown> {
  return { ...lead };
}

function serializeCampaign(campaign: Campaign, steps?: CampaignStep[]): Record<string, unknown> {
  return steps ? { ...campaign, steps } : { ...campaign };
}

// ── auth/test ───────────────────────────────────────────────────────────────

export async function restAuthTest(
  ctx: MuseAccessContext,
  deps: RestApiDeps
): Promise<RestApiResult> {
  const [user, workspace] = await Promise.all([
    deps.getUserLabel(ctx.userId),
    deps.getWorkspaceLabel(ctx.workspaceId),
  ]);
  return ok({
    user: { id: ctx.userId, email: user?.email ?? null },
    workspace: { id: ctx.workspaceId, name: workspace?.name ?? null },
    scopes: [...ctx.scopes],
  });
}

// ── Leads ───────────────────────────────────────────────────────────────────

export async function restListLeads(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  query: URLSearchParams
): Promise<RestApiResult> {
  const parsed = parseListParams(query);
  if (parsed.error) return parsed.error;
  const leads = await deps.leads.listLeads(ctx.workspaceId);
  const page = paginateLeads(leads, parsed.limit, parsed.after, parsed.order);
  return ok({ leads: page.map(serializeLead), count: page.length });
}

export async function restGetLead(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  id: string
): Promise<RestApiResult> {
  const lead = await getLeadById(deps.leads, ctx.workspaceId, id);
  if (!lead) return notFound("Lead");
  return ok({ lead: serializeLead(lead) });
}

function parseLeadInput(body: Record<string, unknown>): {
  input: CreateLeadInput;
  error?: RestApiResult;
} {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmailAddress(email)) {
    return {
      input: { first_name: "", tags: [] },
      error: err(400, "A valid email address is required.", "invalid_email"),
    };
  }
  const status =
    typeof body.status === "string" && (LEAD_STATUSES as readonly string[]).includes(body.status)
      ? (body.status as Lead["status"])
      : undefined;
  return {
    input: {
      first_name: typeof body.first_name === "string" ? body.first_name : "",
      last_name: typeof body.last_name === "string" ? body.last_name : undefined,
      email,
      company: typeof body.company === "string" ? body.company : undefined,
      job_title: typeof body.job_title === "string" ? body.job_title : undefined,
      linkedin_url: typeof body.linkedin_url === "string" ? body.linkedin_url : undefined,
      tags: Array.isArray(body.tags)
        ? (body.tags as unknown[]).filter((t): t is string => typeof t === "string")
        : [],
      ...(status ? { status } : {}),
    },
  };
}

export async function restCreateLead(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  body: Record<string, unknown>
): Promise<RestApiResult> {
  const { input, error } = parseLeadInput(body);
  if (error) return error;
  const email = normalizeEmail(input.email);
  const existing = (await deps.leads.listLeads(ctx.workspaceId)).find(
    (l) => normalizeEmail(l.email) === email
  );
  if (existing) {
    return ok({ lead: serializeLead(existing), duplicate: true });
  }
  const lead = await deps.leads.createLead(ctx.workspaceId, input);
  await deps.emit("lead.created", ctx.workspaceId, {
    source: `${deps.platform.platform}_api`,
    leadId: lead.id,
    email: lead.email ?? undefined,
    firstName: lead.first_name ?? undefined,
    company: lead.company ?? undefined,
  });
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "lead_created",
    resource: `${deps.platform.platform}:lead:${lead.id}`,
    details: `Lead created via ${apiLabel(deps)} API (${lead.email ?? "no email"}).`,
  });
  return ok({ lead: serializeLead(lead), duplicate: false }, 201);
}

const UPDATABLE_LEAD_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "company",
  "job_title",
  "linkedin_url",
  "status",
  "tags",
  "custom_fields",
] as const;

export async function restUpdateLead(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  id: string,
  body: Record<string, unknown>
): Promise<RestApiResult> {
  const existing = await getLeadById(deps.leads, ctx.workspaceId, id);
  if (!existing) return notFound("Lead");
  const patch: Partial<Lead> = {};
  const changedFields: string[] = [];
  for (const field of UPDATABLE_LEAD_FIELDS) {
    if (!(field in body)) continue;
    if (field === "email") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!isValidEmailAddress(email)) {
        return err(400, "A valid email address is required.", "invalid_email");
      }
      patch.email = email;
    } else if (field === "status") {
      if (
        typeof body.status !== "string" ||
        !(LEAD_STATUSES as readonly string[]).includes(body.status)
      ) {
        return err(
          400,
          `status must be one of: ${LEAD_STATUSES.join(", ")}.`,
          "invalid_status"
        );
      }
      patch.status = body.status as Lead["status"];
    } else if (field === "tags") {
      if (!Array.isArray(body.tags)) {
        return err(400, "tags must be an array of strings.", "invalid_tags");
      }
      patch.tags = (body.tags as unknown[]).filter((t): t is string => typeof t === "string");
    } else if (field === "custom_fields") {
      if (!body.custom_fields || typeof body.custom_fields !== "object") {
        return err(400, "custom_fields must be an object.", "invalid_custom_fields");
      }
      patch.custom_fields = body.custom_fields as Record<string, unknown>;
    } else if (typeof body[field] === "string") {
      (patch as Record<string, unknown>)[field] = body[field];
    } else if (body[field] === undefined || body[field] === null) {
      (patch as Record<string, unknown>)[field] = undefined;
    } else {
      return err(400, `${field} must be a string.`, "invalid_field");
    }
    changedFields.push(field);
  }
  if (changedFields.length === 0) {
    return err(400, "No updatable lead field was provided.", "no_fields");
  }
  const updated = await deps.leads.updateLead(id, patch);
  await deps.emit("lead.updated", ctx.workspaceId, {
    source: `${deps.platform.platform}_api`,
    leadId: updated.id,
    changed_fields: changedFields,
  });
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "lead_updated",
    resource: `${deps.platform.platform}:lead:${updated.id}`,
    details: `Lead updated via ${apiLabel(deps)} API (changed: ${changedFields.join(", ")}).`,
  });
  return ok({ lead: serializeLead(updated) });
}

export async function restImportLeads(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  body: Record<string, unknown>
): Promise<RestApiResult> {
  const raw = Array.isArray(body.leads) ? body.leads : [];
  if (raw.length === 0) {
    return err(400, "import needs at least one lead.", "invalid_params");
  }
  if (raw.length > 100) {
    return err(400, "import accepts at most 100 leads per call.", "invalid_params");
  }
  const existing = await deps.leads.listLeads(ctx.workspaceId);
  const existingEmails = new Set(existing.map((l) => normalizeEmail(l.email)));
  const seen = new Set<string>();
  const toImport: CreateLeadInput[] = [];
  let skipped = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      skipped++;
      continue;
    }
    const { input, error } = parseLeadInput(item as Record<string, unknown>);
    if (error) {
      skipped++;
      continue;
    }
    const email = normalizeEmail(input.email);
    if (existingEmails.has(email) || seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);
    toImport.push(input);
  }
  const created = toImport.length > 0 ? await deps.leads.importLeads(ctx.workspaceId, toImport) : [];
  if (created.length > 0) {
    await deps.emit("lead.created", ctx.workspaceId, {
      source: `${deps.platform.platform}_api_import`,
      count: created.length,
      leadIds: created.map((l) => l.id),
    });
  }
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "leads_imported",
    resource: `${deps.platform.platform}:workspace:${ctx.workspaceId}`,
    details: `Imported ${created.length} lead(s) via ${apiLabel(deps)} API (${skipped} skipped).`,
  });
  return ok({ created: created.length, skipped, leads: created.map(serializeLead) }, 201);
}

// ── Campaigns ───────────────────────────────────────────────────────────────

export async function restListCampaigns(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  query: URLSearchParams
): Promise<RestApiResult> {
  const parsed = parseListParams(query);
  if (parsed.error) return parsed.error;
  const campaigns = await deps.campaigns.listCampaigns(ctx.workspaceId);
  const sorted = [...campaigns].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const after = parsed.after;
  const filtered =
    after === null ? sorted : sorted.filter((c) => c.created_at < after);
  const page = filtered.slice(0, parsed.limit);
  return ok({ campaigns: page.map((c) => serializeCampaign(c)), count: page.length });
}

export async function restGetCampaign(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  id: string
): Promise<RestApiResult> {
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, id);
  if (!campaign) return notFound("Campaign");
  const steps = await deps.campaigns.getCampaignSteps(campaign.id).catch(() => []);
  return ok({ campaign: serializeCampaign(campaign, steps) });
}

function parseCampaignSteps(
  raw: unknown
): { steps: CampaignStepDraft[]; error?: RestApiResult } {
  const rawSteps = Array.isArray(raw) ? raw : [];
  if (rawSteps.length === 0) {
    return { steps: [], error: err(400, "At least one sequence step is required.", "invalid_params") };
  }
  const steps: CampaignStepDraft[] = [];
  for (let i = 0; i < rawSteps.length; i++) {
    const s = rawSteps[i] as Record<string, unknown>;
    if (!s || typeof s !== "object" || !VALID_STEP_TYPES.includes(s.step_type as StepType)) {
      return {
        steps: [],
        error: err(400, `Step ${i + 1}: step_type must be a valid step type.`, "invalid_params"),
      };
    }
    const delay = typeof s.delay_hours === "number" ? s.delay_hours : 0;
    if (delay < 0) {
      return {
        steps: [],
        error: err(400, `Step ${i + 1}: delay_hours must be >= 0.`, "invalid_params"),
      };
    }
    if (
      (s.step_type === "email" || s.step_type === "linkedin_message") &&
      !(typeof s.content === "string" && s.content.trim())
    ) {
      return {
        steps: [],
        error: err(
          400,
          `Step ${i + 1}: ${String(s.step_type)} steps require non-empty content.`,
          "invalid_params"
        ),
      };
    }
    steps.push({
      step_type: s.step_type as StepType,
      delay_hours: delay,
      subject: typeof s.subject === "string" ? s.subject : undefined,
      content: typeof s.content === "string" ? s.content : undefined,
      config:
        s.config && typeof s.config === "object"
          ? (s.config as Record<string, unknown>)
          : undefined,
    });
  }
  return { steps };
}

export async function restCreateCampaign(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  body: Record<string, unknown>
): Promise<RestApiResult> {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return err(400, "name is required.", "invalid_params");
  }
  const type = typeof body.type === "string" ? body.type : "email";
  if (!(VALID_CAMPAIGN_TYPES as readonly string[]).includes(type)) {
    return err(400, "type must be one of: linkedin, email, mixed.", "invalid_params");
  }
  if (body.status !== undefined && body.status !== "draft") {
    // Draft only: neither platform can launch a campaign directly (no
    // server-side wizard launch validation exists to reuse).
    return err(
      400,
      "Campaigns are created as drafts only. Launch a draft from the NxtSend dashboard, then pause/resume it from ${apiLabel(deps)}.",
      "invalid_status"
    );
  }
  const { steps, error } = parseCampaignSteps(body.steps);
  if (error) return error;
  const input: CreateCampaignInput = {
    name,
    type: type as CampaignType,
    status: "draft",
    steps,
    description: typeof body.description === "string" ? body.description : undefined,
  };
  const campaign = await deps.campaigns.createCampaign(ctx.workspaceId, input);
  const createdSteps = await deps.campaigns.getCampaignSteps(campaign.id).catch(() => []);
  await deps.emit("campaign.created", ctx.workspaceId, {
    source: `${deps.platform.platform}_api`,
    campaignId: campaign.id,
    name: campaign.name,
    status: campaign.status,
  });
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "campaign_created",
    resource: `${deps.platform.platform}:campaign:${campaign.id}`,
    details: `Campaign "${campaign.name}" created via ${apiLabel(deps)} API (draft, ${steps.length} steps).`,
  });
  return ok({ campaign: serializeCampaign(campaign, createdSteps) }, 201);
}

export async function restUpdateCampaign(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  id: string,
  body: Record<string, unknown>
): Promise<RestApiResult> {
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, id);
  if (!campaign) return notFound("Campaign");
  if (body.status !== undefined) {
    // Status moves go through the same transition rules as the
    // action endpoints (pause/resume/stop/archive).
    const target = String(body.status);
    const action =
      target === "paused" ? "pause" : target === "active" ? "resume" : target === "archived" ? "stop" : null;
    if (!action) {
      return err(400, "status must be one of: paused, active, archived.", "invalid_status");
    }
    const result = await restCampaignAction(ctx, deps, id, action);
    if (result.status !== 200) return result;
    // A PATCH may also carry other fields — apply them after the move.
    const { status: _status, ...rest } = body;
    void _status;
    if (Object.keys(rest).length === 0) return result;
    return restUpdateCampaignFields(ctx, deps, id, rest);
  }
  return restUpdateCampaignFields(ctx, deps, id, body);
}

async function restUpdateCampaignFields(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  id: string,
  body: Record<string, unknown>
): Promise<RestApiResult> {
  const patch: Parameters<CampaignsRepository["updateCampaign"]>[1] = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (
    typeof body.type === "string" &&
    (VALID_CAMPAIGN_TYPES as readonly string[]).includes(body.type)
  ) {
    patch.type = body.type as CampaignType;
  }
  if (typeof body.description === "string") patch.description = body.description;
  if (Object.keys(patch).length === 0) {
    return err(400, "No updatable campaign field was provided.", "no_fields");
  }
  const updated = await deps.campaigns.updateCampaign(id, patch);
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "campaign_updated",
    resource: `${deps.platform.platform}:campaign:${id}`,
    details: `Campaign updated via ${apiLabel(deps)} API (${Object.keys(patch).join(", ")}).`,
  });
  return ok({ campaign: serializeCampaign(updated) });
}

/**
 * pause (active → paused), resume (paused → active),
 * stop (→ archived), archive (→ archived). Same `requiredFrom`
 * rules as the MCP adapter's pause/resume/stop/archive tools.
 */
export async function restCampaignAction(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  id: string,
  action: "pause" | "resume" | "stop" | "archive"
): Promise<RestApiResult> {
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, id);
  if (!campaign) return notFound("Campaign");
  const target: CampaignStatus =
    action === "pause" ? "paused" : action === "resume" ? "active" : "archived";
  const requiredFrom: CampaignStatus | null =
    action === "pause" ? "active" : action === "resume" ? "paused" : null;
  if (target === "archived" && campaign.status === "archived") {
    return err(400, "Campaign is already archived.", "invalid_params");
  }
  if (requiredFrom && campaign.status !== requiredFrom) {
    const verb =
      target === "paused"
        ? "Only an active campaign can be paused"
        : "Only a paused campaign can be resumed";
    return err(400, `${verb} (current status: ${campaign.status}).`, "invalid_params");
  }
  const from = campaign.status;
  await deps.campaigns.setCampaignStatus(ctx.workspaceId, campaign.id, target);
  const updated = await deps.campaigns.getCampaign(ctx.workspaceId, campaign.id);
  await deps.emit("campaign.status_changed", ctx.workspaceId, {
    source: `${deps.platform.platform}_api`,
    campaignId: campaign.id,
    status: target,
    previous_status: from,
  });
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "campaign_status_changed",
    resource: `${deps.platform.platform}:campaign:${campaign.id}`,
    details: `Campaign "${campaign.name}" ${action}d via ${apiLabel(deps)} API (${from} → ${target}).`,
  });
  return ok({ campaign: serializeCampaign(updated ?? { ...campaign, status: target }) });
}

export async function restCampaignPerformance(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  id: string
): Promise<RestApiResult> {
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, id);
  if (!campaign) return notFound("Campaign");
  const statsDeps: CampaignStatsDeps = {
    campaignsRepo: deps.campaigns,
    inboxRepo: deps.inbox,
    leadsRepo: deps.leads,
    mode: deps.mode,
  };
  const { byCampaign } = await loadCampaignStats(statsDeps, ctx.workspaceId, [campaign]);
  const stats = byCampaign.get(campaign.id);
  if (!stats) {
    return err(502, "Campaign performance could not be computed.", "stats_unavailable");
  }
  // `accepted` stays null — no data source exists for it anywhere
  // in the product; it is never fabricated.
  return ok({ campaign_id: campaign.id, stats });
}

export async function restAddLeadsToCampaign(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  campaignId: string,
  body: Record<string, unknown>
): Promise<RestApiResult> {
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) return notFound("Campaign");
  const leadIds = Array.isArray(body.lead_ids)
    ? (body.lead_ids as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  if (leadIds.length === 0) {
    return err(400, "At least one lead id is required (lead_ids).", "invalid_params");
  }
  const leads = await deps.leads.listLeads(ctx.workspaceId);
  const known = new Set(leads.map((l) => l.id));
  const notFoundIds = leadIds.filter((id) => !known.has(id));
  const toEnroll = leadIds.filter((id) => known.has(id));
  const { enrolled, skipped } = await deps.campaigns.enrollLeads(
    ctx.workspaceId,
    campaign.id,
    toEnroll
  );
  if (enrolled > 0) {
    await deps.emit("lead.added_to_campaign", ctx.workspaceId, {
      source: `${deps.platform.platform}_api`,
      campaignId: campaign.id,
      leadIds: toEnroll,
      enrolled,
    });
  }
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "leads_enrolled",
    resource: `${deps.platform.platform}:campaign:${campaign.id}`,
    details: `Enrolled ${enrolled} lead(s) into "${campaign.name}" via ${apiLabel(deps)} API (${skipped} skipped).`,
  });
  return ok({ campaignId: campaign.id, enrolled, skipped, notFound: notFoundIds });
}

export async function restRemoveLeadFromCampaign(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  campaignId: string,
  leadId: string
): Promise<RestApiResult> {
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) return notFound("Campaign");
  const lead = await getLeadById(deps.leads, ctx.workspaceId, leadId);
  if (!lead) return notFound("Lead");
  await deps.campaigns.removeEnrollment(campaign.id, lead.id);
  await deps.emit("lead.removed_from_campaign", ctx.workspaceId, {
    source: `${deps.platform.platform}_api`,
    campaignId: campaign.id,
    leadId: lead.id,
  });
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "lead_removed_from_campaign",
    resource: `${deps.platform.platform}:campaign:${campaign.id}`,
    details: `Lead ${lead.id} removed from "${campaign.name}" via ${apiLabel(deps)} API.`,
  });
  return ok({ campaignId: campaign.id, leadId: lead.id, removed: true });
}

// ── Conversations / replies ─────────────────────────────────────────────────

export async function restListConversations(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  query: URLSearchParams
): Promise<RestApiResult> {
  const parsed = parseListParams(query);
  if (parsed.error) return parsed.error;
  const q = query.get("q") ?? undefined;
  const { conversations } = await deps.inbox.listConversations(ctx.workspaceId, {
    search: q,
    limit: parsed.limit,
  });
  return ok({ conversations, count: conversations.length });
}

export async function restGetConversation(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  id: string
): Promise<RestApiResult> {
  const thread = await deps.inbox.getThread(ctx.workspaceId, id);
  if (!thread) return notFound("Conversation");
  return ok({ conversation: thread.conversation, messages: thread.messages });
}

const REPLY_FAILURE_STATUS: Record<string, number> = {
  not_found: 404,
  empty_content: 400,
  missing_idempotency_key: 400,
  invalid_recipient: 400,
  linkedin_unavailable: 422,
  suppressed: 422,
  not_configured: 503,
  provider_error: 502,
};

export async function restSendReply(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  conversationId: string,
  body: Record<string, unknown>
): Promise<RestApiResult> {
  const outcome = await deps.sendReply({
    workspaceId: ctx.workspaceId,
    conversationId,
    content: typeof body.content === "string" ? body.content : "",
    subject: typeof body.subject === "string" ? body.subject : undefined,
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
  });
  if (!outcome.ok) {
    return {
      status: REPLY_FAILURE_STATUS[outcome.code] ?? 400,
      body: { error: outcome.error, code: outcome.code, message: outcome.message },
    };
  }
  // A duplicate replay is NOT emitted again — the original send
  // already produced this event.
  if (!outcome.duplicate) {
    await deps.emit("conversation.reply_created", ctx.workspaceId, {
      source: `${deps.platform.platform}_api`,
      conversationId,
      messageId: outcome.message.id,
      duplicate: false,
    });
  }
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "reply_sent",
    resource: `${deps.platform.platform}:conversation:${conversationId}`,
    details: `Inbox reply sent via ${apiLabel(deps)} API (message ${outcome.message.id}${outcome.duplicate ? ", duplicate replay" : ""}).`,
  });
  return ok({ message: outcome.message, duplicate: outcome.duplicate }, 201);
}

// ── Accounts / usage ────────────────────────────────────────────────────────

export async function restListAccounts(
  ctx: MuseAccessContext,
  deps: RestApiDeps
): Promise<RestApiResult> {
  const accounts = await deps.accounts.listAccounts(ctx.workspaceId);
  return ok({ accounts, count: accounts.length });
}

export async function restGetAccount(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  accountId: string
): Promise<RestApiResult> {
  const account = await deps.accounts.getAccount(ctx.workspaceId, accountId);
  if (!account) return notFound("Account");
  return ok({ account });
}

export async function restGetAccountStatus(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  accountId: string
): Promise<RestApiResult> {
  const account = await deps.accounts.getAccount(ctx.workspaceId, accountId);
  if (!account) return notFound("Account");
  // Status is a recorded fact from the account row (see ConnectedAccount):
  // `status` is the workspace-facing state, `auth_status` the last
  // provider-reported authorization state. `connected` is true only
  // when the workspace-facing state is "connected" — never a live probe.
  return ok({
    account_status: {
      account_id: account.id,
      channel: account.channel,
      provider: account.provider,
      display_name: account.display_name,
      handle_or_email: account.handle_or_email,
      status: account.status,
      auth_status: account.auth_status,
      connected: account.status === "connected",
      warmup_status: account.warmup_status,
      warmup_enabled: account.warmup_enabled,
      last_sync_at: account.last_sync_at,
      last_error: account.last_error,
    },
  });
}

export async function restGetUsage(
  ctx: MuseAccessContext,
  deps: RestApiDeps
): Promise<RestApiResult> {
  const usage = await deps.usage.getWorkspaceUsage(ctx.workspaceId);
  return ok({ usage });
}

// ── Search ──────────────────────────────────────────────────────────────────

export async function restSearchLeads(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  query: URLSearchParams
): Promise<RestApiResult> {
  const id = query.get("id");
  if (id) {
    const lead = await getLeadById(deps.leads, ctx.workspaceId, id);
    return ok({ leads: lead ? [serializeLead(lead)] : [] });
  }
  const email = query.get("email");
  if (email) {
    const leads = await deps.leads.listLeads(ctx.workspaceId);
    const match = leads.find((l) => normalizeEmail(l.email) === normalizeEmail(email));
    return ok({ leads: match ? [serializeLead(match)] : [] });
  }
  const results = await searchLeads(deps.leads, ctx.workspaceId, query.get("q") ?? "");
  return ok({ leads: results.map(serializeLead) });
}

export async function restSearchCampaigns(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  query: URLSearchParams
): Promise<RestApiResult> {
  const id = query.get("id");
  if (id) {
    const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, id);
    return ok({ campaigns: campaign ? [serializeCampaign(campaign)] : [] });
  }
  let campaigns = await deps.campaigns.listCampaigns(ctx.workspaceId);
  const status = query.get("status");
  if (status) {
    if (!(CAMPAIGN_STATUSES as readonly string[]).includes(status)) {
      return err(400, `status must be one of: ${CAMPAIGN_STATUSES.join(", ")}.`, "invalid_status");
    }
    campaigns = campaigns.filter((c) => c.status === status);
  }
  const q = (query.get("q") ?? "").trim().toLowerCase();
  if (q) {
    campaigns = campaigns.filter((c) => c.name.toLowerCase().includes(q));
  }
  return ok({ campaigns: campaigns.map((c) => serializeCampaign(c)) });
}

export async function restSearchConversations(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  query: URLSearchParams
): Promise<RestApiResult> {
  const { conversations } = await deps.inbox.listConversations(ctx.workspaceId, {
    search: query.get("q") ?? undefined,
    limit: 100,
  });
  return ok({ conversations });
}

export async function restSearchAccounts(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  query: URLSearchParams
): Promise<RestApiResult> {
  const accounts = await deps.accounts.listAccounts(ctx.workspaceId);
  const q = (query.get("q") ?? "").trim().toLowerCase();
  const filtered = q
    ? accounts.filter((a) =>
        `${a.provider ?? ""} ${a.display_name ?? ""} ${a.handle_or_email ?? ""}`
          .toLowerCase()
          .includes(q)
      )
    : accounts;
  return ok({ accounts: filtered });
}

// ── Dropdowns ───────────────────────────────────────────────────────────────

export async function restDropdownCampaigns(
  ctx: MuseAccessContext,
  deps: RestApiDeps
): Promise<RestApiResult> {
  const campaigns = await deps.campaigns.listCampaigns(ctx.workspaceId);
  return ok({
    items: campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status })),
  });
}

export async function restDropdownAccounts(
  ctx: MuseAccessContext,
  deps: RestApiDeps
): Promise<RestApiResult> {
  const accounts = await deps.accounts.listAccounts(ctx.workspaceId);
  return ok({
    items: accounts.map((a) => ({
      id: a.id,
      name: a.display_name ?? a.handle_or_email ?? a.id,
      provider: a.provider,
      channel: a.channel,
      handle_or_email: a.handle_or_email ?? null,
      status: a.status,
    })),
  });
}

export function restDropdownLeadStatuses(): RestApiResult {
  return ok({ items: LEAD_STATUSES.map((s) => ({ id: s, name: s })) });
}

/**
 * Campaign steps ("sequences") for one campaign. There is no
 * workspace-wide sequence list in the product — steps belong to a
 * campaign — so `campaign_id` is required.
 */
export async function restDropdownSequences(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  query: URLSearchParams
): Promise<RestApiResult> {
  const campaignId = query.get("campaign_id");
  if (!campaignId) {
    return err(400, "campaign_id is required (steps belong to a campaign).", "invalid_params");
  }
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) return notFound("Campaign");
  const steps = await deps.campaigns.getCampaignSteps(campaign.id);
  return ok({
    items: steps.map((s) => ({
      id: s.id,
      name: `Step ${s.step_order}: ${s.step_type}`,
      step_type: s.step_type,
      step_order: s.step_order,
    })),
  });
}

// ── Webhook subscriptions ───────────────────────────────────────────────────

export async function restSubscribeWebhook(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  body: Record<string, unknown>
): Promise<RestApiResult> {
  const result = await subscribePlatformWebhook(deps.store, deps.platform.platform, ctx.workspaceId, ctx.userId, {
    event: body.event,
    target_url: body.target_url,
  });
  if (!result.ok) return err(result.status, result.error, result.code);
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "webhook_subscribed",
    resource: `${deps.platform.platform}:webhook:${result.subscription.id}`,
    details: `${apiLabel(deps)} webhook subscribed for ${result.subscription.event} → ${result.subscription.target_url}.`,
  });
  // The per-subscription secret is NEVER in this response.
  return ok({ id: result.subscription.id, event: result.subscription.event, target_url: result.subscription.target_url }, 201);
}

export async function restUnsubscribeWebhook(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  body: Record<string, unknown>
): Promise<RestApiResult> {
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return err(400, "id is required.", "invalid_params");
  }
  const result = await unsubscribePlatformWebhook(deps.store, deps.platform.platform, ctx.workspaceId, id);
  if (!result.ok) return err(result.status, result.error ?? "Subscription not found.", result.code ?? "not_found");
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "webhook_unsubscribed",
    resource: `${deps.platform.platform}:webhook:${id}`,
    details: `${apiLabel(deps)} webhook unsubscribed.`,
  });
  return ok({ id, unsubscribed: true });
}

export async function restListWebhookSubscriptions(
  ctx: MuseAccessContext,
  deps: RestApiDeps
): Promise<RestApiResult> {
  const subs = await deps.store.listSubscriptions(ctx.workspaceId, deps.platform.platform);
  return ok({ subscriptions: subs.map((s) => publicSubscription(s)) });
}

// ── Lead delete (n8n only — the Zapier routes do not expose it) ────────────

export async function restDeleteLead(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  id: string
): Promise<RestApiResult> {
  const lead = await getLeadById(deps.leads, ctx.workspaceId, id);
  if (!lead) return notFound("Lead");
  await deps.leads.deleteLead(id);
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "lead_deleted",
    resource: `${deps.platform.platform}:lead:${id}`,
    details: `Lead deleted via ${apiLabel(deps)} API (${lead.email ?? "no email"}).`,
  });
  return ok({ id, deleted: true });
}

// ── Campaign sequence (steps) ───────────────────────────────────────────────

export async function restGetCampaignSequence(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  campaignId: string
): Promise<RestApiResult> {
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) return notFound("Campaign");
  const steps = await deps.campaigns.getCampaignSteps(campaign.id);
  return ok({ campaign_id: campaign.id, steps });
}

export async function restReplaceCampaignSteps(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  campaignId: string,
  body: Record<string, unknown>
): Promise<RestApiResult> {
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) return notFound("Campaign");
  const { steps, error } = parseCampaignSteps(body.steps);
  if (error) return error;
  const replaced = await deps.campaigns.replaceCampaignSteps(campaign.id, steps);
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "campaign_sequence_replaced",
    resource: `${deps.platform.platform}:campaign:${campaign.id}`,
    details: `Campaign "${campaign.name}" sequence replaced via ${apiLabel(deps)} API (${replaced.length} steps).`,
  });
  return ok({ campaign_id: campaign.id, steps: replaced });
}

// ── Scheduled follow-ups ────────────────────────────────────────────────────
//
// Honest scope note: scheduled replies are workspace-scoped in the
// data model — a ScheduledReply carries a conversation_id but no
// campaign_id, and conversations carry no campaign link either.
// These functions therefore verify the campaign exists (404
// otherwise) and operate on the workspace's scheduled replies; the
// campaign segment is an existence check, not a filter. Scheduling
// stores a row and sends NOTHING immediately (the worker sends due
// rows); cancelling marks it cancelled and it is never sent.

function followUpsUnavailable(): RestApiResult {
  return err(503, "Scheduled follow-ups are not configured on this deployment.", "not_configured");
}

export async function restListScheduledFollowUps(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  campaignId: string
): Promise<RestApiResult> {
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) return notFound("Campaign");
  if (!deps.scheduledReplies) return followUpsUnavailable();
  const followUps = await deps.scheduledReplies.listUpcoming(ctx.workspaceId);
  return ok({ campaign_id: campaign.id, follow_ups: followUps, count: followUps.length });
}

export async function restScheduleFollowUp(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  campaignId: string,
  body: Record<string, unknown>
): Promise<RestApiResult> {
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) return notFound("Campaign");
  if (!deps.scheduledReplies) return followUpsUnavailable();
  const conversationId =
    typeof body.conversation_id === "string" ? body.conversation_id.trim() : "";
  if (!conversationId) {
    return err(400, "conversation_id is required.", "invalid_params");
  }
  const thread = await deps.inbox.getThread(ctx.workspaceId, conversationId);
  if (!thread) return notFound("Conversation");
  const content = typeof body.body === "string" ? body.body.trim() : "";
  if (!content) {
    return err(400, "body is required.", "invalid_params");
  }
  const scheduledAt = typeof body.scheduled_at === "string" ? body.scheduled_at : "";
  if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
    return err(400, "scheduled_at must be an ISO 8601 timestamp.", "invalid_params");
  }
  const followUp = await deps.scheduledReplies.schedule(ctx.workspaceId, {
    conversation_id: conversationId,
    body: content,
    scheduled_at: new Date(scheduledAt).toISOString(),
  });
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "follow_up_scheduled",
    resource: `${deps.platform.platform}:campaign:${campaign.id}`,
    details: `Follow-up scheduled via ${apiLabel(deps)} API for conversation ${conversationId} at ${followUp.scheduled_at}.`,
  });
  return ok({ follow_up: followUp }, 201);
}

export async function restCancelFollowUp(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  campaignId: string,
  followUpId: string
): Promise<RestApiResult> {
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) return notFound("Campaign");
  if (!deps.scheduledReplies) return followUpsUnavailable();
  const upcoming = await deps.scheduledReplies.listUpcoming(ctx.workspaceId);
  if (!upcoming.some((r) => r.id === followUpId)) {
    return notFound("Follow-up");
  }
  const cancelled = await deps.scheduledReplies.cancel(followUpId);
  await deps.audit({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: "follow_up_cancelled",
    resource: `${deps.platform.platform}:campaign:${campaign.id}`,
    details: `Follow-up ${followUpId} cancelled via ${apiLabel(deps)} API.`,
  });
  return ok({ id: cancelled.id, cancelled: true });
}

// ── Sequence execution status ───────────────────────────────────────────────

export async function restGetSequenceExecutionStatus(
  ctx: MuseAccessContext,
  deps: RestApiDeps,
  campaignId: string
): Promise<RestApiResult> {
  const campaign = await deps.campaigns.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) return notFound("Campaign");
  const statsDeps: CampaignStatsDeps = {
    campaignsRepo: deps.campaigns,
    inboxRepo: deps.inbox,
    leadsRepo: deps.leads,
    mode: deps.mode,
  };
  const executions = await loadCampaignExecutions(statsDeps, ctx.workspaceId, [campaign]);
  const byStatus: Record<string, number> = {};
  const byStep: Record<string, { step_order: number; total: number; by_status: Record<string, number> }> = {};
  for (const exec of executions) {
    byStatus[exec.status] = (byStatus[exec.status] ?? 0) + 1;
    const key = String(exec.step_order);
    const step = byStep[key] ?? { step_order: exec.step_order, total: 0, by_status: {} };
    step.total += 1;
    step.by_status[exec.status] = (step.by_status[exec.status] ?? 0) + 1;
    byStep[key] = step;
  }
  return ok({
    campaign_id: campaign.id,
    status: campaign.status,
    executions: {
      total: executions.length,
      by_status: byStatus,
      steps: Object.values(byStep).sort((a, b) => a.step_order - b.step_order),
    },
  });
}
