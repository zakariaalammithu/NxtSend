import { NextResponse } from "next/server";
import {
  resolveCenterContext,
  isWorkspaceAdminRole,
} from "@/lib/integrations-center/server";
import { getDataMode } from "@/lib/data/mode";
import { getEmailState } from "@/lib/email/state";
import {
  checkDomainAuth,
  normalizeDomain,
  COMMON_DKIM_SELECTORS,
  type DkimSelectorToCheck,
} from "@/lib/email/dns-check";
import {
  extractEmailDomain,
  listResendDomains,
  matchEmailFromDomain,
  dkimSelectorsFromDomain,
  type ResendDomainInfo,
} from "@/lib/email/domains";

/**
 * POST /api/email-auth/check  { domain?: string }
 *
 * Runs REAL DNS lookups (SPF / DMARC / DKIM) for a domain — default:
 * the EMAIL_FROM domain — and cross-checks the domain against the
 * Resend account's verified domains when a key is configured.
 *
 * The verdicts describe what the public DNS records say and whether
 * the provider has verified the domain. They say NOTHING about inbox
 * placement — no such claim is computable from DNS, and the UI copy
 * says so.
 *
 * Guards mirror the integrations verify route: session via
 * resolveCenterContext; in live mode the caller must be a workspace
 * owner/admin (the check performs outbound lookups under the
 * workspace's context). Demo mode: the DNS check still runs for real
 * (it reads public DNS only — nothing is simulated), but no provider
 * key exists, so the provider section honestly reports "not
 * configured".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await resolveCenterContext();
  if (!ctx.ok) return ctx.response;

  if (ctx.mode !== "demo" && !isWorkspaceAdminRole(ctx.workspaceRole)) {
    return NextResponse.json(
      {
        error:
          "Forbidden: running an email authentication check requires a workspace owner or admin role.",
      },
      { status: 403 }
    );
  }

  let requested: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      domain?: unknown;
    };
    if (typeof body.domain === "string" && body.domain.trim()) {
      requested = body.domain;
    }
  } catch {
    // Body is optional — fall through to the default domain.
  }

  const env = process.env as Record<string, string | undefined>;
  const defaultDomain = extractEmailDomain(env.EMAIL_FROM);
  const domain = normalizeDomain(requested ?? defaultDomain);
  const mode = getDataMode();

  if (requested && !domain) {
    return NextResponse.json(
      {
        error: `"${requested}" is not a valid domain. Enter a domain like example.com.`,
      },
      { status: 400 }
    );
  }

  if (!domain) {
    // No EMAIL_FROM to derive a domain from and none supplied: the UI
    // asks the operator for one. Not an error — nothing was checked.
    return NextResponse.json({
      domain: null,
      needsDomain: true,
      mode,
      defaultDomain: null,
      checkedAt: new Date().toISOString(),
      dns: null,
      provider: {
        configured: false,
        state: "not_configured",
        message:
          "EMAIL_FROM is not set, so there is no sending domain to compare against the provider. Set EMAIL_FROM, or type a domain to check its public DNS records.",
        fromDomain: null,
        match: null,
        domains: [],
        recordsToAdd: [],
      },
    });
  }

  // ── Provider side (Resend) ────────────────────────────────────────
  const apiKey = env.RESEND_API_KEY;
  const emailConfigured = getEmailState(env, mode) === "connected";
  let providerDomains: ResendDomainInfo[] = [];
  let providerError: string | null = null;
  if (emailConfigured && apiKey) {
    const list = await listResendDomains(apiKey, { detailDomain: domain });
    providerDomains = list.domains;
    providerError = list.error;
  }
  const match = matchEmailFromDomain(providerDomains, env.EMAIL_FROM);
  const checkedProviderDomain =
    providerDomains.find((d) => d.name.toLowerCase() === domain) ?? null;
  const recordsToAdd = checkedProviderDomain?.records ?? [];

  // ── DNS side ──────────────────────────────────────────────────────
  // Provider-reported DKIM selectors are authoritative; the common
  // guesses are added and labelled as guesses by the checker.
  const providerSelectorNames: string[] = [];
  for (const d of providerDomains) {
    for (const s of dkimSelectorsFromDomain(d)) {
      if (!providerSelectorNames.includes(s)) providerSelectorNames.push(s);
    }
  }
  const providerSelectors: DkimSelectorToCheck[] = providerSelectorNames.map(
    (selector) => ({ selector, source: "provider" as const })
  );
  const guessSelectors: DkimSelectorToCheck[] = COMMON_DKIM_SELECTORS.filter(
    (s) => !providerSelectors.some((p) => p.selector === s)
  ).map((selector) => ({ selector, source: "guess" as const }));

  const dns = await checkDomainAuth(domain, {
    dkimSelectors: [...providerSelectors, ...guessSelectors],
  });

  const provider = !emailConfigured
    ? {
        configured: false,
        state: "not_configured" as const,
        message:
          mode === "demo"
            ? "Demo mode: no Resend key is configured, so the provider's domain list cannot be read. The DNS verdicts below are real public-DNS lookups; nothing about the provider is simulated."
            : "Resend is not fully configured (RESEND_API_KEY + EMAIL_FROM), so the provider's domain list cannot be read.",
        fromDomain: defaultDomain,
        match: null,
        domains: [] as { name: string; status: string }[],
        recordsToAdd: [] as typeof recordsToAdd,
      }
    : providerError
      ? {
          configured: true,
          state: "error" as const,
          message: `Resend could not be read (${providerError}) — the provider match could not be determined. The DNS verdicts below are unaffected.`,
          fromDomain: defaultDomain,
          match: null,
          domains: [] as { name: string; status: string }[],
          recordsToAdd: [] as typeof recordsToAdd,
        }
      : {
          configured: true,
          state: match.state,
          message:
            match.state === "verified"
              ? `The EMAIL_FROM domain (${match.fromDomain}) is verified at Resend.`
              : match.state === "not_verified"
                ? `The EMAIL_FROM domain (${match.fromDomain}) exists at Resend but is NOT verified (provider status: "${match.domain?.status}"). Resend rejects sends from unverified domains.`
                : match.state === "not_listed"
                  ? `The EMAIL_FROM domain (${match.fromDomain}) is NOT in the Resend account's domain list. Add and verify it in Resend — sends from it will be rejected until then.`
                  : "EMAIL_FROM could not be parsed, so the provider match could not be determined.",
          fromDomain: match.fromDomain,
          match: match.state,
          domains: providerDomains.map((d) => ({
            name: d.name,
            status: d.status,
          })),
          recordsToAdd,
        };

  return NextResponse.json({
    domain,
    needsDomain: false,
    mode,
    defaultDomain,
    checkedAt: new Date().toISOString(),
    dns,
    provider,
  });
}
