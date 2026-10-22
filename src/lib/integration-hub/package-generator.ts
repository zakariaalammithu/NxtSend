/**
 * Copy Integration Package generator (P7 Stage B).
 *
 * Builds the shareable "everything a reviewer/integrator needs" bundle
 * for one integration FROM its Hub records: identity + workflow status,
 * endpoints, scopes, tool inventory, credential METADATA, documents,
 * checklist progress, and compliance links.
 *
 * Secrets are excluded BY CONSTRUCTION:
 *  - The default input carries only `HubCredentialMetadata` objects —
 *    a type with no value field — so there is nothing to leak.
 *  - Decrypted values can only enter through the SEPARATE, explicit
 *    `includedSecrets` parameter (label/kind/environment/value), which
 *    the service layer fills ONLY for credential ids the admin named
 *    in the request, after a successful strict-audit write. Rendered
 *    with included secrets, the package is headed by a SENSITIVE
 *    banner in both formats.
 *  - Credential last-4 fragments are never rendered here at all (the
 *    package shows kind/environment/status/expiry only).
 *
 * The rendered package is never persisted by the service layer.
 */
import type { DataMode } from "@/lib/data/mode";
import type {
  HubChecklistRollup,
  HubCredentialMetadata,
  HubDocumentRecord,
  HubIntegrationRecord,
} from "./hub-core";

export interface HubPackageEndpoint {
  label: string;
  url: string;
  method?: string;
  notes?: string;
}

export interface HubPackageTool {
  name: string;
  scope?: string;
  permission?: string;
  description?: string;
}

export interface HubPackageLink {
  label: string;
  url: string;
}

/** A decrypted value admitted to the package via the explicit include path. */
export interface HubPackageIncludedSecret {
  label: string;
  kind: string;
  environment: string;
  value: string;
}

export interface HubPackageInput {
  integration: HubIntegrationRecord;
  credentials: HubCredentialMetadata[];
  documents: HubDocumentRecord[];
  checklist: HubChecklistRollup | null;
  generatedAt: string;
  /** App data mode: "demo" packages carry the DEMO banner. */
  mode: DataMode;
  /** Only ever populated by the service after strict audit. */
  includedSecrets?: HubPackageIncludedSecret[];
}

function metaList<T>(meta: Record<string, unknown>, key: string): T[] {
  const v = meta[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function metaScopes(meta: Record<string, unknown>): {
  profile: string | null;
  scopes: string[];
} {
  const profile =
    typeof meta.scope_profile === "string" ? meta.scope_profile : null;
  const scopes = Array.isArray(meta.scopes)
    ? meta.scopes.filter((s): s is string => typeof s === "string")
    : [];
  return { profile, scopes };
}

function metaStrings(meta: Record<string, unknown>, key: string): string[] {
  const v = meta[key];
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string")
    : [];
}

/** Structured package model — the JSON rendering, and the MD source. */
export interface HubPackageModel {
  package: "nxtsend-integration-hub/copy-package";
  version: 1;
  demo: boolean;
  sensitive: boolean;
  generated_at: string;
  integration: {
    name: string;
    slug: string;
    vendor: string | null;
    category: string;
    status: string;
    external_status_note: string | null;
    website_url: string | null;
    docs_url: string | null;
    review_portal_url: string | null;
    support_email: string | null;
    summary: string;
  };
  endpoints: HubPackageEndpoint[];
  scopes: { profile: string | null; scopes: string[] };
  tools: HubPackageTool[];
  credentials: Array<{
    label: string;
    kind: string;
    environment: string;
    status: string;
    expires_at: string | null;
    value: string | null; // null unless explicitly included (audited)
  }>;
  documents: Array<{ title: string; kind: string; slug: string; body: string }>;
  checklist: HubChecklistRollup | null;
  compliance_links: HubPackageLink[];
  known_limitations: string[];
}

export function buildPackageModel(input: HubPackageInput): HubPackageModel {
  const { integration } = input;
  const meta = integration.metadata ?? {};
  const included = input.includedSecrets ?? [];
  const includedByKey = new Map(
    included.map((s) => [`${s.label}::${s.environment}`, s.value])
  );
  return {
    package: "nxtsend-integration-hub/copy-package",
    version: 1,
    demo: input.mode === "demo",
    sensitive: included.length > 0,
    generated_at: input.generatedAt,
    integration: {
      name: integration.name,
      slug: integration.slug,
      vendor: integration.vendor,
      category: integration.category,
      status: integration.status,
      external_status_note: integration.external_status_note,
      website_url: integration.website_url,
      docs_url: integration.docs_url,
      review_portal_url: integration.review_portal_url,
      support_email: integration.support_email,
      summary: integration.summary,
    },
    endpoints: metaList<HubPackageEndpoint>(meta, "endpoints").filter(
      (e) => e && typeof e.url === "string"
    ),
    scopes: metaScopes(meta),
    tools: metaList<HubPackageTool>(meta, "tool_inventory").filter(
      (t) => t && typeof t.name === "string"
    ),
    credentials: input.credentials.map((c) => ({
      label: c.label,
      kind: c.kind,
      environment: c.environment,
      status: c.status,
      expires_at: c.expires_at,
      value: includedByKey.get(`${c.label}::${c.environment}`) ?? null,
    })),
    documents: input.documents.map((d) => ({
      title: d.title,
      kind: d.kind,
      slug: d.slug,
      body: d.body,
    })),
    checklist: input.checklist,
    compliance_links: metaList<HubPackageLink>(meta, "compliance_links").filter(
      (l) => l && typeof l.url === "string"
    ),
    known_limitations: metaStrings(meta, "known_limitations"),
  };
}

export function renderPackageJson(model: HubPackageModel): string {
  return JSON.stringify(model, null, 2);
}

export function renderPackageMarkdown(model: HubPackageModel): string {
  const lines: string[] = [];
  const i = model.integration;
  if (model.demo) {
    lines.push("> **DEMO — NOT REAL CREDENTIALS.** Generated from NxtSend Demo Mode fixtures. Nothing in this package is a real value.");
    lines.push("");
  }
  if (model.sensitive) {
    lines.push("> ⚠️ **SENSITIVE — CONTAINS CREDENTIAL VALUES.** This package includes decrypted credential values that were explicitly selected for export. Handle accordingly; the export was audit-logged.");
    lines.push("");
  }
  lines.push(`# ${i.name} — Integration Package`);
  lines.push("");
  lines.push(`Generated: ${model.generated_at}`);
  lines.push("");
  lines.push("## Status");
  lines.push("");
  lines.push(`- Workflow status: **${i.status}**`);
  if (i.external_status_note) {
    lines.push(`- External status (as recorded): ${i.external_status_note}`);
  }
  if (i.vendor) lines.push(`- Vendor: ${i.vendor}`);
  if (i.website_url) lines.push(`- Website: ${i.website_url}`);
  if (i.docs_url) lines.push(`- Documentation: ${i.docs_url}`);
  if (i.review_portal_url) lines.push(`- Review portal: ${i.review_portal_url}`);
  if (i.support_email) lines.push(`- Support: ${i.support_email}`);
  if (i.summary) {
    lines.push("");
    lines.push(i.summary);
  }
  if (model.endpoints.length > 0) {
    lines.push("");
    lines.push("## Endpoints");
    lines.push("");
    for (const e of model.endpoints) {
      lines.push(`- ${e.method ? `\`${e.method}\` ` : ""}**${e.label}** — ${e.url}${e.notes ? ` (${e.notes})` : ""}`);
    }
  }
  if (model.scopes.profile || model.scopes.scopes.length > 0) {
    lines.push("");
    lines.push("## OAuth scopes");
    lines.push("");
    if (model.scopes.profile) lines.push(`Profile: \`${model.scopes.profile}\``);
    lines.push("");
    for (const s of model.scopes.scopes) lines.push(`- \`${s}\``);
  }
  if (model.tools.length > 0) {
    lines.push("");
    lines.push("## Tools");
    lines.push("");
    lines.push("| Tool | Scope | Permission |");
    lines.push("| --- | --- | --- |");
    for (const t of model.tools) {
      lines.push(`| \`${t.name}\` | ${t.scope ?? ""} | ${t.permission ?? ""} |`);
    }
  }
  lines.push("");
  lines.push("## Credentials");
  lines.push("");
  if (model.credentials.length === 0) {
    lines.push("No credentials recorded.");
  } else {
    lines.push("| Label | Kind | Environment | Status | Expires | Value |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const c of model.credentials) {
      lines.push(
        `| ${c.label} | ${c.kind} | ${c.environment} | ${c.status} | ${c.expires_at ?? "—"} | ${c.value !== null ? "included (see below)" : "not included"} |`
      );
    }
  }
  const withValues = model.credentials.filter((c) => c.value !== null);
  if (withValues.length > 0) {
    lines.push("");
    lines.push("### Included credential values (explicit export)");
    lines.push("");
    for (const c of withValues) {
      lines.push(`- **${c.label}** (${c.kind}, ${c.environment}): \`${c.value}\``);
    }
  }
  if (model.documents.length > 0) {
    lines.push("");
    lines.push("## Documents");
    for (const d of model.documents) {
      lines.push("");
      lines.push(`### ${d.title} (${d.kind})`);
      lines.push("");
      lines.push(d.body);
    }
  }
  if (model.checklist) {
    lines.push("");
    lines.push("## Checklist progress");
    lines.push("");
    lines.push(
      `${model.checklist.done}/${model.checklist.total - model.checklist.not_applicable} applicable items done (${model.checklist.percent_done}%), ${model.checklist.blocked} blocked.`
    );
  }
  if (model.compliance_links.length > 0) {
    lines.push("");
    lines.push("## Compliance links");
    lines.push("");
    for (const l of model.compliance_links) {
      lines.push(`- [${l.label}](${l.url})`);
    }
  }
  if (model.known_limitations.length > 0) {
    lines.push("");
    lines.push("## Known limitations");
    lines.push("");
    for (const k of model.known_limitations) lines.push(`- ${k}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** One-call render in either format. */
export function buildCopyPackage(
  input: HubPackageInput,
  format: "md" | "json"
): string {
  const model = buildPackageModel(input);
  return format === "json" ? renderPackageJson(model) : renderPackageMarkdown(model);
}
