import { describe, it, expect, beforeAll } from "vitest";
import {
  contentHash,
  detectAccountIntent,
  foldText,
  isClearLeader,
  matchKnowledge,
  normaliseText,
  scoreEntry,
  tokenize,
  type MatchableEntry,
} from "../answer-core";
import { DemoSupportStore } from "../demo-store";
import { toMatchable } from "../pipeline";

let seeded: MatchableEntry[] = [];

beforeAll(async () => {
  const store = new DemoSupportStore();
  const answerable = await store.listAnswerable();
  seeded = answerable.map(toMatchable);
});

function bySlug(slug: string): MatchableEntry {
  const entry = seeded.find((e) => e.slug === slug);
  if (!entry) throw new Error(`seed entry missing: ${slug}`);
  return entry;
}

function synthetic(partial: Partial<MatchableEntry> & { id: string }): MatchableEntry {
  return {
    slug: partial.id,
    title: "",
    question: "",
    answer: "",
    keywords: [],
    category_name: "",
    priority: 50,
    related_url: null,
    ...partial,
  };
}

describe("normalisation & synonyms", () => {
  it("normalises case, punctuation and whitespace (NFKC)", () => {
    expect(normaliseText("  How   MUCH??  ")).toBe("how much");
    expect(tokenize("How much does NxtSend cost?")).toContain("price");
  });

  it("folds 'log in' and 'sign in' to the same tokens", () => {
    expect(foldText("How do I log in with Google?")).toBe(
      foldText("How do I sign in with Google?")
    );
  });

  it("folds 'forgot my password' to the password-reset phrase", () => {
    expect(foldText("I forgot my password")).toBe("password reset");
  });
});

describe("matcher — seeded golden questions", () => {
  const golden: Array<{ query: string; slug: string }> = [
    { query: "How much does NxtSend cost?", slug: "how-much-does-nxtsend-cost" },
    { query: "What is the pricing?", slug: "how-much-does-nxtsend-cost" },
    { query: "Why are my LinkedIn steps marked as skipped?", slug: "linkedin-steps-skipped" },
    { query: "Does NxtSend have a public API?", slug: "public-api" },
    { query: "How do I export my leads?", slug: "export-leads" },
    { query: "How do I sign in with Google?", slug: "google-sign-in" },
    { query: "I forgot my password", slug: "forgot-password" },
    { query: "Does NxtSend use credits or a prepaid balance?", slug: "credits-or-balance" },
    { query: "How does email warm-up work?", slug: "how-warmup-works" },
    { query: "How do I contact NxtSend?", slug: "how-to-contact" },
  ];

  for (const { query, slug } of golden) {
    it(`answers "${query}" from ${slug}`, () => {
      const result = matchKnowledge(query, seeded);
      expect(result.entry?.slug).toBe(slug);
      expect(result.band).not.toBe("fallback");
      expect(result.score).toBeGreaterThanOrEqual(55);
    });
  }

  it("exact canonical question scores 100 (direct band)", () => {
    const result = matchKnowledge("How much does NxtSend cost?", seeded);
    expect(result.score).toBe(100);
    expect(result.band).toBe("direct");
  });

  it("unknown questions fall back (no confident answer invented)", () => {
    for (const query of [
      "Do you offer discounts for students?",
      "What is the weather like in Austin today?",
      "Can you deliver my LinkedIn messages by carrier pigeon?",
    ]) {
      const result = matchKnowledge(query, seeded);
      expect(result.band).toBe("fallback");
      expect(result.score).toBeLessThan(55);
    }
  });
});

describe("matcher — margin rule & bands", () => {
  const leader = synthetic({
    id: "leader",
    title: "alpha beta",
    question: "alpha beta gamma",
    keywords: ["alpha"],
    answer: "alpha",
  });
  const closeCompetitor = synthetic({
    id: "competitor",
    title: "alpha beta",
    question: "alpha beta delta",
    keywords: ["alpha", "beta"],
    answer: "alpha",
  });

  // Query token SET {alpha, beta, gamma} in scrambled order, so the
  // weighted path (not the exact-match shortcut) produces the score.
  const QUERY = "gamma beta alpha";

  it("a mid-band score with no competitor is a clear leader", () => {
    const result = matchKnowledge(QUERY, [leader]);
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.score).toBeLessThan(75);
    expect(result.band).toBe("leader");
  });

  it("a mid-band score with a close competitor falls back", () => {
    const result = matchKnowledge(QUERY, [leader, closeCompetitor]);
    expect(result.band).toBe("fallback");
    expect(result.margin).toBeLessThan(10);
  });

  it("isClearLeader: margin >= 10 or a weak runner-up", () => {
    expect(isClearLeader(65, 55)).toBe(true);
    expect(isClearLeader(65, 58)).toBe(false);
    expect(isClearLeader(60, 30)).toBe(true);
    expect(isClearLeader(60, null)).toBe(true);
  });
});

describe("matcher — priority is a tie-break only", () => {
  it("equal scores order by priority, but priority adds no points", () => {
    const low = synthetic({
      id: "low",
      title: "alpha beta",
      question: "alpha beta gamma",
      keywords: ["alpha"],
      answer: "alpha",
      priority: 5,
    });
    const high = synthetic({ ...low, id: "high", priority: 95 });
    const result = matchKnowledge("gamma beta alpha", [low, high]);
    expect(result.candidates[0].entry.id).toBe("high");
    expect(result.candidates[0].score).toBe(result.candidates[1].score);
  });

  it("an irrelevant high-priority entry never beats a relevant one", () => {
    const irrelevant = synthetic({
      id: "irrelevant",
      title: "zorblax handling",
      question: "what is a zorblax",
      keywords: ["zorblax"],
      answer: "zorblax",
      priority: 100,
    });
    const result = matchKnowledge("How much does NxtSend cost?", [irrelevant, bySlug("how-much-does-nxtsend-cost")]);
    expect(result.entry?.slug).toBe("how-much-does-nxtsend-cost");
    expect(scoreEntry("How much does NxtSend cost?", irrelevant)).toBe(0);
  });
});

describe("account-intent guard", () => {
  it("detects account-specific questions", () => {
    expect(detectAccountIntent("Where is my invoice?")?.label).toBe("billing");
    expect(detectAccountIntent("my campaign is not sending")?.label).toBe("campaigns");
    expect(detectAccountIntent("How do I change my password?")?.label).toBe("account");
  });

  it("leaves general questions alone", () => {
    expect(detectAccountIntent("How much does NxtSend cost?")).toBeNull();
    expect(detectAccountIntent("How do invoices work in NxtSend?")).toBeNull();
    expect(detectAccountIntent("How do I set up a campaign?")).toBeNull();
  });
});

describe("indexing helpers", () => {
  it("contentHash is deterministic and content-sensitive", () => {
    expect(contentHash("abc")).toBe(contentHash("abc"));
    expect(contentHash("abc")).not.toBe(contentHash("abd"));
  });
});
