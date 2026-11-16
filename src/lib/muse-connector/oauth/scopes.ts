/**
 * OAuth scopes — Muse (`muse.*`) and ChatGPT (`nxtsend.*`).
 *
 * The manifest (../manifest.ts) classifies tools as Read / Write /
 * Sensitive write; scopes are the OAuth-level grouping of those
 * classes. A requested scope must be a subset of the known scopes —
 * anything else is refused with `invalid_scope`, never silently
 * dropped or widened.
 *
 * Two prefixes, one meaning: `muse.read` and `nxtsend.read` grant
 * exactly the same tier of access. The prefix records which platform
 * the grant belongs to (so the consent screen and the scope string
 * round-trip honestly); authorization decisions MUST go through
 * `grantHasTier`, never through a string prefix check, so a grant
 * holding either prefix satisfies the tier it needs. Tiers are
 * independent: `send` does NOT imply `write` or `read` — a grant
 * must hold each tier it needs.
 */

export const MUSE_SCOPES = ["muse.read", "muse.write", "muse.send"] as const;

export const NXT_SEND_SCOPES = ["nxtsend.read", "nxtsend.write", "nxtsend.send"] as const;

/** Every scope this authorization server issues, both platforms. */
export const ALL_OAUTH_SCOPES = [...MUSE_SCOPES, ...NXT_SEND_SCOPES] as const;

export type MuseScope = (typeof MUSE_SCOPES)[number];
export type NxtSendScope = (typeof NXT_SEND_SCOPES)[number];
/** Any scope this server issues, either platform prefix. */
export type OAuthScope = MuseScope | NxtSendScope;

export type ScopeTier = "read" | "write" | "send";

/**
 * Tier of each scope. Both prefixes map to the same tier — the
 * prefix is provenance (which platform the grant is for), not
 * privilege.
 */
export const SCOPE_TIER_MAP: Record<OAuthScope, ScopeTier> = {
  "muse.read": "read",
  "muse.write": "write",
  "muse.send": "send",
  "nxtsend.read": "read",
  "nxtsend.write": "write",
  "nxtsend.send": "send",
};

const SCOPE_SET = new Set<string>(ALL_OAUTH_SCOPES);

/** Plain-words description of each scope, shown on the consent screen. */
export const MUSE_SCOPE_DESCRIPTIONS: Record<MuseScope, string> = {
  "muse.read":
    "Read your leads, campaigns, inbox conversations and usage — no changes are made.",
  "muse.write":
    "Create and change leads and draft campaigns, and pause, resume or archive campaigns — never sends anything.",
  "muse.send":
    "Send email and inbox replies, and permanently delete leads. Every send needs your approval in Muse each time.",
};

export const NXT_SEND_SCOPE_DESCRIPTIONS: Record<NxtSendScope, string> = {
  "nxtsend.read":
    "Read your leads, campaigns, inbox conversations and usage — no changes are made.",
  "nxtsend.write":
    "Create and change leads and draft campaigns, and pause, resume or archive campaigns — never sends anything.",
  "nxtsend.send":
    "Send email and inbox replies, and permanently delete leads. Every send needs your approval in ChatGPT each time.",
};

/** Description for any issued scope, whichever prefix was requested. */
export const SCOPE_DESCRIPTIONS: Record<OAuthScope, string> = {
  ...MUSE_SCOPE_DESCRIPTIONS,
  ...NXT_SEND_SCOPE_DESCRIPTIONS,
};

/** Plain-words description for one scope (unknown scopes have none). */
export function scopeDescription(scope: string): string | null {
  return (SCOPE_DESCRIPTIONS as Record<string, string>)[scope] ?? null;
}

/**
 * True when the grant satisfies a tier: it holds ANY scope mapping
 * to that tier (either prefix). Tiers are independent — holding
 * `send` says nothing about `read` or `write`.
 */
export function grantHasTier(scopes: string[], tier: ScopeTier): boolean {
  return scopes.some((s) => (SCOPE_TIER_MAP as Record<string, ScopeTier>)[s] === tier);
}

/**
 * Parses a space-separated scope string. Accepts either prefix
 * (`muse.*` or `nxtsend.*`); returns the de-duplicated scopes in
 * request order, or null when any requested scope is unknown. An
 * empty/omitted scope defaults to read-only (`muse.read`) — the
 * least privilege. Callers that know the client platform should
 * apply the platform default themselves (see
 * `defaultScopeForPlatform`) instead of relying on this default.
 */
export function normalizeScopes(input: string | null | undefined): OAuthScope[] | null {
  if (!input || !input.trim()) return ["muse.read"];
  const seen = new Set<string>();
  const out: OAuthScope[] = [];
  for (const part of input.trim().split(/\s+/)) {
    if (!SCOPE_SET.has(part)) return null;
    if (!seen.has(part)) {
      seen.add(part);
      out.push(part as OAuthScope);
    }
  }
  return out.length > 0 ? out : ["muse.read"];
}

/**
 * Backwards-compatible name for `normalizeScopes`: parses a
 * space-separated scope string, accepting either prefix.
 */
export function parseMuseScopes(input: string | null | undefined): OAuthScope[] | null {
  return normalizeScopes(input);
}

/** True when every requested scope is one of the known scopes. */
export function isValidMuseScopeSubset(scopes: string[]): scopes is OAuthScope[] {
  return scopes.every((s) => SCOPE_SET.has(s));
}

/** Least-privilege default scope for a client platform. */
export function defaultScopeForPlatform(platform: "muse" | "chatgpt"): OAuthScope {
  return platform === "chatgpt" ? "nxtsend.read" : "muse.read";
}
