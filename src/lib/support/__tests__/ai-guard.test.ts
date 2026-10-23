import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  generateGroundedAnswer,
  validateGroundedAnswer,
} from "../ai";
import type { MatchableEntry } from "../answer-core";

const candidate: MatchableEntry = {
  id: "kb-webhooks",
  slug: "webhook-events-and-signing",
  title: "Which webhook events exist and how are they signed?",
  question: "Which webhook events exist and how are they signed and retried?",
  answer:
    "NxtSend sends three outbound webhook events: lead.created, campaign.created and campaign.status_changed. Deliveries are signed with an X-NxtSend-Signature HMAC-SHA256 header, and failed deliveries are retried (at +5 and +30 minutes, up to 3 attempts).",
  keywords: ["webhooks"],
  category_name: "Integrations & Developers",
  priority: 60,
  related_url: "/developers",
};

describe("grounded-answer guard", () => {
  it("accepts a faithful answer citing a supplied source", () => {
    const result = validateGroundedAnswer(
      "SOURCES: kb-webhooks\nNxtSend sends lead.created, campaign.created and campaign.status_changed, signed with an X-NxtSend-Signature HMAC-SHA256 header.",
      [candidate]
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sourceIds).toEqual(["kb-webhooks"]);
      expect(result.answer).toContain("lead.created");
    }
  });

  it("rejects an invented price figure", () => {
    const result = validateGroundedAnswer(
      "SOURCES: kb-webhooks\nWebhooks cost $99 per month and are signed with HMAC-SHA256.",
      [candidate]
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invented_figure");
  });

  it("rejects an invented URL", () => {
    const result = validateGroundedAnswer(
      "SOURCES: kb-webhooks\nSee https://example.com/fake-docs for the webhook list.",
      [candidate]
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invented_url");
  });

  it("allows figures that appear in the sources (+5/+30 minutes, 3 attempts)", () => {
    const result = validateGroundedAnswer(
      "SOURCES: kb-webhooks\nFailed deliveries are retried at +5 and +30 minutes, up to 3 attempts.",
      [candidate]
    );
    // "+5"/"+30" are not $ or % figures; the guard's figure classes pass.
    expect(result.ok).toBe(true);
  });

  it("rejects missing or bogus citations", () => {
    expect(validateGroundedAnswer("Just an answer.", [candidate]).ok).toBe(false);
    const bogus = validateGroundedAnswer("SOURCES: kb-nope\nAnswer.", [candidate]);
    expect(bogus.ok).toBe(false);
    if (!bogus.ok) expect(bogus.reason).toBe("invalid_citations");
  });

  it("treats the NO_ANSWER token as no answer", () => {
    const result = validateGroundedAnswer("NO_ANSWER", [candidate]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_answer");
  });
});

describe("generateGroundedAnswer with a mocked provider", () => {
  const previousKey = process.env.OPENAI_API_KEY;

  beforeAll(() => {
    process.env.OPENAI_API_KEY = "sk-unit-test-key";
  });
  afterAll(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });

  function fakeFetch(content: string): typeof fetch {
    return (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content } }] }),
        text: async () => "",
      }) as unknown as Response) as typeof fetch;
  }

  it("returns the grounded answer when the completion is faithful", async () => {
    const result = await generateGroundedAnswer({
      question: "How are webhooks signed?",
      candidates: [candidate],
      providerOverride: "openai",
      fetchFn: fakeFetch(
        "SOURCES: kb-webhooks\nDeliveries are signed with an X-NxtSend-Signature HMAC-SHA256 header."
      ),
    });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.sourceIds).toEqual(["kb-webhooks"]);
      expect(result.provider).toBe("openai");
    }
  });

  it("rejects a hallucinating completion (invented price) instead of surfacing it", async () => {
    const result = await generateGroundedAnswer({
      question: "How are webhooks signed?",
      candidates: [candidate],
      providerOverride: "openai",
      fetchFn: fakeFetch(
        "SOURCES: kb-webhooks\nWebhooks are a $499 add-on signed with HMAC-SHA256."
      ),
    });
    expect(result.status).toBe("rejected");
  });

  it("maps a provider failure to an error result, never a fake answer", async () => {
    const failingFetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await generateGroundedAnswer({
      question: "How are webhooks signed?",
      candidates: [candidate],
      providerOverride: "openai",
      fetchFn: failingFetch,
    });
    expect(result.status).toBe("error");
  });

  it("with no provider it is not_configured — deterministic path stays in charge", async () => {
    const result = await generateGroundedAnswer({
      question: "How are webhooks signed?",
      candidates: [candidate],
      providerOverride: null,
    });
    expect(result.status).toBe("not_configured");
  });
});
