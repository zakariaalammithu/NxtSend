/**
 * Support answer engine — PURE core (P10 Stage E).
 *
 * Deterministic knowledge-base matching: no I/O, no database, no AI.
 * The pipeline (pipeline.ts) feeds it the answerable entries
 * (published + enabled + indexed, in enabled categories) and this
 * module decides — with pinned, unit-tested calibration — whether the
 * top entry may be answered directly, may be answered as a clear
 * leader, or must fall back (with an escalation offer).
 *
 * Scoring (0–100):
 *   exact normalised-question match          -> 100
 *   question-phrase containment              -> at least 92
 *   otherwise weighted query-token overlap:
 *     question ×40, title ×25, keywords ×20, category ×10, answer ×5
 *   `priority` is a TIE-BREAK ONLY (sort order between near-equal
 *   scores) — it never adds points, so an important-but-irrelevant
 *   entry can never win on priority alone.
 *
 * Decision bands:
 *   score >= 75                              -> "direct"
 *   55 <= score < 75 AND clear leader        -> "leader"
 *   otherwise                                -> "fallback"
 * Clear leader = margin over the runner-up >= 10 points, OR the
 * runner-up scores below 40 (no plausible competitor). The margin
 * rule exists so two competing mid-range answers never produce a
 * confident-sounding coin flip.
 */

// ── Normalisation ──────────────────────────────────────────────────────────

/**
 * Curated synonym map — DATA, not code branches. Applied to the
 * normalised string before tokenising, longest phrases first. Keep it
 * small and product-specific; every entry should be a paraphrase a
 * real visitor would type.
 */
export const SUPPORT_SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  ["sign in", "login"],
  ["log in", "login"],
  ["sign into", "login"],
  ["sign up", "signup"],
  ["create an account", "signup"],
  ["create account", "signup"],
  ["forgot my password", "password reset"],
  ["forgot password", "password reset"],
  ["reset my password", "password reset"],
  ["change my password", "password reset"],
  ["how much", "price"],
  ["pricing", "price"],
  ["costs", "price"],
  ["cost", "price"],
  ["fees", "price"],
  ["fee", "price"],
  ["money back", "refund"],
  ["free trial", "trial"],
  ["trial period", "trial"],
  ["rented profiles", "avatars"],
  ["rented profile", "avatars"],
  ["rental profiles", "avatars"],
  ["rent profiles", "avatars"],
  ["rent a profile", "avatars"],
  ["outreach profiles", "avatars"],
  ["workspace roles", "roles"],
  ["user roles", "roles"],
  ["talk to a person", "human support"],
  ["talk to someone", "human support"],
  ["real person", "human support"],
  ["customer support", "support"],
  ["tech support", "support"],
  ["get in touch", "contact"],
  ["email address", "email"],
  ["delete my workspace", "delete workspace"],
  ["delete my account", "delete account"],
  ["cancel my subscription", "cancel subscription"],
  ["sales navigator", "sales navigator"],
  ["warm up", "warmup"],
  ["warming up", "warmup"],
];

/** Function words that carry no retrieval signal. */
export const SUPPORT_STOPWORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "is", "are", "was", "were", "do", "does", "did",
  "i", "me", "my", "we", "you", "your", "it", "its", "to", "of", "in",
  "on", "for", "with", "and", "or", "if", "so", "at", "by", "from",
  "can", "could", "should", "would", "will", "what", "when", "where",
  "which", "who", "whom", "how", "why", "there", "here", "this", "that",
  "am", "be", "been", "have", "has", "had", "please", "just", "about",
  "into", "get", "got",
]);

export function normaliseText(input: string): string {
  const lowered = input.normalize("NFKC").toLowerCase();
  // Punctuation -> space, without unicode property escapes (the
  // project's TS target predates them). Non-ASCII letters are kept.
  const cleaned = lowered
    .split("")
    .map((ch) => (/[a-z0-9\s]/.test(ch) || ch.charCodeAt(0) > 127 ? ch : " "))
    .join("");
  return cleaned.replace(/\s+/g, " ").trim();
}

function applySynonyms(normalised: string): string {
  let out = ` ${normalised} `;
  const sorted = [...SUPPORT_SYNONYMS].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sorted) {
    out = out.split(` ${from} `).join(` ${to} `);
  }
  return out.trim();
}

/** Content tokens: normalised, synonym-folded, stopwords removed. */
export function tokenize(input: string): string[] {
  const folded = applySynonyms(normaliseText(input));
  if (!folded) return [];
  return folded
    .split(" ")
    .filter((token) => token.length >= 2 && !SUPPORT_STOPWORDS.has(token));
}

/** The folded normalised string (used for exact/containment checks). */
export function foldText(input: string): string {
  return tokenize(input).join(" ");
}

// ── Scoring ────────────────────────────────────────────────────────────────

export interface MatchableEntry {
  id: string;
  slug: string;
  title: string;
  question: string;
  answer: string;
  keywords: string[];
  category_name: string;
  priority: number;
  related_url: string | null;
}

export const SCORE_WEIGHTS = {
  question: 40,
  title: 25,
  keywords: 20,
  category: 10,
  answer: 5,
} as const;

export const DIRECT_THRESHOLD = 75;
export const LEADER_THRESHOLD = 55;
export const CLEAR_LEADER_MARGIN = 10;
export const CLEAR_LEADER_RUNNER_UP_BELOW = 40;

function overlapRatio(queryTokens: ReadonlySet<string>, fieldTokens: ReadonlySet<string>): number {
  if (queryTokens.size === 0) return 0;
  let matched = 0;
  for (const token of Array.from(queryTokens)) {
    if (fieldTokens.has(token)) matched += 1;
  }
  return matched / queryTokens.size;
}

function isContiguousSubsequence(needle: string[], haystack: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function scoreEntry(query: string, entry: MatchableEntry): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;
  const querySet = new Set(queryTokens);

  const questionTokens = tokenize(entry.question);
  if (foldText(entry.question) === foldText(query)) return 100;

  if (
    isContiguousSubsequence(questionTokens, queryTokens) ||
    isContiguousSubsequence(queryTokens, questionTokens)
  ) {
    return Math.max(92, weightedScore(querySet, entry));
  }
  return weightedScore(querySet, entry);
}

function weightedScore(querySet: ReadonlySet<string>, entry: MatchableEntry): number {
  const title = overlapRatio(querySet, new Set(tokenize(entry.title)));
  const question = overlapRatio(querySet, new Set(tokenize(entry.question)));
  const keywords = overlapRatio(
    querySet,
    new Set(entry.keywords.flatMap((keyword) => tokenize(keyword)))
  );
  const category = overlapRatio(querySet, new Set(tokenize(entry.category_name)));
  const answer = overlapRatio(querySet, new Set(tokenize(entry.answer)));
  const score =
    question * SCORE_WEIGHTS.question +
    title * SCORE_WEIGHTS.title +
    keywords * SCORE_WEIGHTS.keywords +
    category * SCORE_WEIGHTS.category +
    answer * SCORE_WEIGHTS.answer;
  return Math.round(score * 10) / 10;
}

// ── Matching ───────────────────────────────────────────────────────────────

export type AnswerBand = "direct" | "leader" | "fallback";

export interface ScoredCandidate {
  entry: MatchableEntry;
  score: number;
}

export interface MatchResult {
  /** The winning entry, or null when nothing scored at all. */
  entry: MatchableEntry | null;
  score: number;
  band: AnswerBand;
  /** Points between #1 and #2 (equals the top score when unopposed). */
  margin: number;
  /** Top candidates, best first (score desc, priority tie-break). */
  candidates: ScoredCandidate[];
}

export function isClearLeader(topScore: number, runnerUpScore: number | null): boolean {
  if (runnerUpScore === null) return true;
  if (topScore - runnerUpScore >= CLEAR_LEADER_MARGIN) return true;
  return runnerUpScore < CLEAR_LEADER_RUNNER_UP_BELOW;
}

export function matchKnowledge(query: string, entries: MatchableEntry[]): MatchResult {
  const scored = entries
    .map((entry) => ({ entry, score: scoreEntry(query, entry) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.priority - a.entry.priority);

  const top = scored[0] ?? null;
  const runnerUp = scored[1] ?? null;
  if (!top) {
    return { entry: null, score: 0, band: "fallback", margin: 0, candidates: [] };
  }
  const margin = runnerUp ? Math.round((top.score - runnerUp.score) * 10) / 10 : top.score;

  let band: AnswerBand;
  if (top.score >= DIRECT_THRESHOLD) {
    band = "direct";
  } else if (
    top.score >= LEADER_THRESHOLD &&
    isClearLeader(top.score, runnerUp ? runnerUp.score : null)
  ) {
    band = "leader";
  } else {
    band = "fallback";
  }

  return {
    entry: top.entry,
    score: top.score,
    band,
    margin,
    candidates: scored.slice(0, 3),
  };
}

// ── Indexing helpers (the write path maintains these with the save) ──────

/** Normalised searchable concatenation stored on the entry row. */
export function buildSearchText(input: {
  title: string;
  question: string;
  keywords: string[];
  category_name: string;
  answer: string;
}): string {
  return [
    input.title,
    input.question,
    input.keywords.join(" "),
    input.category_name,
    input.answer,
  ]
    .map((part) => normaliseText(part))
    .filter(Boolean)
    .join(" ");
}

/**
 * Deterministic content hash (FNV-1a). This is an integrity marker so
 * the admin UI can prove what content is indexed — NOT a security
 * primitive.
 */
export function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ── Account-specific guard ─────────────────────────────────────────────────

/**
 * Questions about the asker's OWN account (my invoice, my plan, my
 * campaign…) are never answered from the KB or by the AI layer — the
 * assistant has no account-data tools. The pipeline routes them to a
 * sign-in / talk-to-a-person pointer instead.
 */
export const ACCOUNT_INTENT_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bmy (invoice|invoices|bill|billing|balance|subscription|plan|payment|charge|charges)\b/, label: "billing" },
  { pattern: /\bmy (campaign|campaigns|leads|audience|sequence|sequences)\b/, label: "campaigns" },
  { pattern: /\bmy (account|password|workspace|profile|email|credits?)\b/, label: "account" },
  { pattern: /\b(refund|chargeback|charged) (me|my)\b/, label: "billing" },
  { pattern: /\bmy (order|avatar|avatars|seat|seats)\b/, label: "billing" },
];

export function detectAccountIntent(text: string): { label: string } | null {
  // Deliberately matched against the normalised text BEFORE synonym
  // folding: folding rewrites "change my password" to "password
  // reset", which would erase the possessive these patterns key on.
  const normalised = normaliseText(text);
  for (const { pattern, label } of ACCOUNT_INTENT_PATTERNS) {
    if (pattern.test(normalised)) return { label };
  }
  return null;
}
