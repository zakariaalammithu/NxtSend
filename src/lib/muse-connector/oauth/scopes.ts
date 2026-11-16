/**
 * Muse OAuth scopes.
 *
 * The manifest (../manifest.ts) classifies tools as Read / Write /
 * Sensitive write; scopes are the OAuth-level grouping of those
 * classes. A requested scope must be a subset of these three —
 * anything else is refused with `invalid_scope`, never silently
 * dropped or widened.
 */

export const MUSE_SCOPES = ["muse.read", "muse.write", "muse.send"] as const;

export type MuseScope = (typeof MUSE_SCOPES)[number];

const SCOPE_SET = new Set<string>(MUSE_SCOPES);

/** Plain-words description of each scope, shown on the consent screen. */
export const MUSE_SCOPE_DESCRIPTIONS: Record<MuseScope, string> = {
  "muse.read":
    "Read your leads, campaigns, inbox conversations and usage — no changes are made.",
  "muse.write":
    "Create and change leads and draft campaigns, and pause, resume or archive campaigns — never sends anything.",
  "muse.send":
    "Send email and inbox replies, and permanently delete leads. Every send needs your approval in Muse each time.",
};

/**
 * Parses a space-separated scope string. Returns the de-duplicated
 * scopes in request order, or null when any requested scope is not
 * one of the three known scopes. An empty/omitted scope defaults to
 * read-only (`muse.read`) — the least privilege.
 */
export function parseMuseScopes(input: string | null | undefined): MuseScope[] | null {
  if (!input || !input.trim()) return ["muse.read"];
  const seen = new Set<string>();
  const out: MuseScope[] = [];
  for (const part of input.trim().split(/\s+/)) {
    if (!SCOPE_SET.has(part)) return null;
    if (!seen.has(part)) {
      seen.add(part);
      out.push(part as MuseScope);
    }
  }
  return out.length > 0 ? out : ["muse.read"];
}

/** True when every requested scope is one of the three known scopes. */
export function isValidMuseScopeSubset(scopes: string[]): scopes is MuseScope[] {
  return scopes.every((s) => SCOPE_SET.has(s));
}
