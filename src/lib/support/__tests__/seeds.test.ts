import { describe, it, expect } from "vitest";
import {
  DEFAULT_SUPPORT_SETTINGS,
  SEED_CATEGORIES,
  SEED_KNOWLEDGE,
  SEED_SAVED_REPLIES,
} from "../seeds";
import { validateRelatedUrl } from "../validate";

describe("support seed content — traceability & honesty", () => {
  it("ships 30 knowledge entries, each traced to a real source", () => {
    expect(SEED_KNOWLEDGE.length).toBe(30);
    for (const entry of SEED_KNOWLEDGE) {
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.question.length).toBeGreaterThan(0);
      expect(entry.answer.length).toBeGreaterThan(0);
    }
  });

  it("every entry references a seeded category and a valid local related_url", () => {
    const categorySlugs = new Set(SEED_CATEGORIES.map((c) => c.slug));
    for (const entry of SEED_KNOWLEDGE) {
      expect(categorySlugs.has(entry.category_slug)).toBe(true);
      const url = validateRelatedUrl(entry.related_url);
      expect(url.ok).toBe(true);
    }
    const slugs = SEED_KNOWLEDGE.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("billing facts match marketing-prices exactly", () => {
    const pricing = SEED_KNOWLEDGE.find((e) => e.slug === "how-much-does-nxtsend-cost");
    expect(pricing?.answer).toContain("$49 per seat per month");
    expect(pricing?.answer).toContain("$499 per month including 20 seats");
    expect(pricing?.answer).toContain("$20 per additional seat");
    expect(pricing?.answer).toContain("$387 per month with 3 profiles included");
    expect(pricing?.answer).toContain("$36.75");
    expect(pricing?.answer).toContain("$441");
    expect(pricing?.answer).toContain("$374.25");
    expect(pricing?.answer).toContain("$4,491");
    expect(pricing?.answer).toContain("$290.25");
    expect(pricing?.answer).toContain("$3,483");
  });

  it("enforces the audit exclusions: no invented product claims", () => {
    const allAnswers = SEED_KNOWLEDGE.map((e) => `${e.title} ${e.answer}`).join("\n");
    // No white-label claim, no proxy claims, no Academy API-docs claim.
    expect(allAnswers.toLowerCase()).not.toContain("white-label");
    expect(allAnswers.toLowerCase()).not.toContain("white label");
    expect(allAnswers.toLowerCase()).not.toContain("residential proxy");
    expect(allAnswers.toLowerCase()).not.toContain("api docs");
    // No invented support hours / response-time promises.
    expect(allAnswers).not.toMatch(/24\/7|within \d+ hours|respond within|response time of/i);
    // "credits" may appear ONLY in the entry that denies them.
    for (const entry of SEED_KNOWLEDGE) {
      if (/credits/i.test(entry.answer)) {
        expect(entry.slug).toBe("credits-or-balance");
        expect(entry.answer).toContain("No.");
      }
    }
  });

  it("the Google Sign-In entry is honest about owner-side enablement", () => {
    const google = SEED_KNOWLEDGE.find((e) => e.slug === "google-sign-in");
    expect(google).toBeDefined();
    expect(google?.answer).toContain("enabled the Google provider");
  });

  it("voice notes are email-attachment only — never LinkedIn delivery", () => {
    const voice = SEED_KNOWLEDGE.find((e) => e.slug === "voice-notes-delivery");
    expect(voice?.answer).toContain("email attachments");
    expect(voice?.answer).toContain("no LinkedIn voice-note delivery");
  });

  it("public API entry says Not Yet; webhook entry carries the real facts", () => {
    const api = SEED_KNOWLEDGE.find((e) => e.slug === "public-api");
    expect(api?.answer).toContain("Not yet");
    const webhooks = SEED_KNOWLEDGE.find((e) => e.slug === "webhook-events-and-signing");
    expect(webhooks?.answer).toContain("lead.created");
    expect(webhooks?.answer).toContain("campaign.created");
    expect(webhooks?.answer).toContain("campaign.status_changed");
    expect(webhooks?.answer).toContain("X-NxtSend-Signature");
    expect(webhooks?.answer).toContain("HMAC-SHA256");
  });

  it("contact facts are the owner's: hello@nxtsend.com, Austin office", () => {
    const contact = SEED_KNOWLEDGE.find((e) => e.slug === "how-to-contact");
    expect(contact?.answer).toContain("hello@nxtsend.com");
    expect(contact?.answer).toContain("Austin, TX 73301, USA");
    expect(DEFAULT_SUPPORT_SETTINGS.support_email).toBe("hello@nxtsend.com");
  });

  it("saved replies seed with unique shortcuts", () => {
    const shortcuts = SEED_SAVED_REPLIES.map((r) => r.shortcut).filter(Boolean);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(SEED_SAVED_REPLIES.length).toBeGreaterThanOrEqual(5);
  });
});
