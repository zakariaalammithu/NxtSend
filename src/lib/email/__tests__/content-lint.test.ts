/**
 * Content-lint tests — one case per rule, plus the negative case that
 * matters most: a clean, ordinary email produces NO hints (a linter
 * that cries wolf gets ignored).
 */

import { describe, it, expect } from "vitest";
import { lintEmailContent } from "../content-lint";

const CLEAN_BODY = [
  "Hi Alex,",
  "",
  "Quick note — we help operations teams cut the time they spend chasing",
  "status updates across tools. Worth a short look this week?",
  "",
  "Happy to send a one-page summary if useful.",
  "",
  "Best,",
  "Sam",
  "",
  "If this isn't relevant, you can unsubscribe and I won't follow up.",
].join("\n");

const ids = (hints: { id: string }[]) => hints.map((h) => h.id);

describe("lintEmailContent", () => {
  it("empty input → no hints", () => {
    expect(lintEmailContent({})).toEqual([]);
    expect(lintEmailContent({ subject: "", body: "" })).toEqual([]);
  });

  it("a clean campaign email produces no hints", () => {
    expect(
      lintEmailContent({
        subject: "Cutting status-chasing time for ops teams",
        body: CLEAN_BODY,
      })
    ).toEqual([]);
  });

  it("missing subject (campaign) fires only with a body", () => {
    expect(ids(lintEmailContent({ body: CLEAN_BODY }))).toContain("missing-subject");
    expect(ids(lintEmailContent({ body: CLEAN_BODY, context: "reply" }))).not.toContain(
      "missing-subject"
    );
  });

  it("ALL-CAPS subject fires", () => {
    const hints = lintEmailContent({
      subject: "AMAZING DEAL JUST FOR YOU",
      body: CLEAN_BODY,
    });
    expect(ids(hints)).toContain("subject-all-caps");
  });

  it("a short acronym subject does not fire the caps rule", () => {
    const hints = lintEmailContent({ subject: "Q3 ROI?", body: CLEAN_BODY });
    expect(ids(hints)).not.toContain("subject-all-caps");
  });

  it("ALL-CAPS body fires", () => {
    const hints = lintEmailContent({
      subject: "Hello",
      body: "THIS IS A VERY IMPORTANT MESSAGE THAT YOU MUST READ RIGHT NOW TODAY. unsubscribe",
    });
    expect(ids(hints)).toContain("body-all-caps");
  });

  it("excessive exclamation fires at 3+", () => {
    const hints = lintEmailContent({
      subject: "Great news!",
      body: `${CLEAN_BODY}\nReally great!!`,
    });
    expect(ids(hints)).toContain("excessive-exclamation");
  });

  it("link-heavy short body fires link-density", () => {
    const hints = lintEmailContent({
      subject: "Links",
      body: "See https://a.com/x and https://b.com/y plus https://c.com/z and https://d.com/w now. unsubscribe",
    });
    expect(ids(hints)).toContain("link-density");
  });

  it("a long body with a few links does not fire link-density", () => {
    const longBody =
      CLEAN_BODY +
      "\nMore detail: https://example.com/docs and https://example.com/pricing and https://example.com/about — " +
      "these pages walk through onboarding, data handling, security reviews, support response times and the migration path in full.";
    const hints = lintEmailContent({ subject: "Details", body: longBody });
    expect(ids(hints)).not.toContain("link-density");
  });

  it("a known URL shortener fires", () => {
    const hints = lintEmailContent({
      subject: "Doc",
      body: `${CLEAN_BODY}\nLink: https://bit.ly/3abcXYZ`,
    });
    expect(ids(hints)).toContain("url-shortener");
  });

  it("a full URL to the same host kind does not fire the shortener rule", () => {
    const hints = lintEmailContent({
      subject: "Doc",
      body: `${CLEAN_BODY}\nLink: https://example.com/bit.ly-guide`,
    });
    expect(ids(hints)).not.toContain("url-shortener");
  });

  it("image-only body fires", () => {
    const hints = lintEmailContent({
      subject: "Offer",
      body: '<img src="https://cdn.example.com/banner.png" alt="offer" />',
    });
    expect(ids(hints)).toContain("image-only");
  });

  it("there is NO missing-unsubscribe hint — the send path appends one (P5 Stage C)", () => {
    const body = CLEAN_BODY.replace(
      "If this isn't relevant, you can unsubscribe and I won't follow up.",
      "No worries if not."
    );
    expect(ids(lintEmailContent({ subject: "Hi", body }))).not.toContain(
      "missing-unsubscribe"
    );
    expect(
      ids(lintEmailContent({ subject: "Re: Hi", body, context: "reply" }))
    ).not.toContain("missing-unsubscribe");
  });

  it("spam-trigger phrases fire (max a few listed)", () => {
    const hints = lintEmailContent({
      subject: "Act now",
      body: "This is 100% free money, risk-free! unsubscribe",
    });
    const phraseHint = hints.find((h) => h.id === "spam-phrases");
    expect(phraseHint).toBeDefined();
    expect(phraseHint?.message).toContain("free money");
  });

  it("template variables are not counted as prose", () => {
    const hints = lintEmailContent({
      subject: "Following up, {{first_name}}",
      body: "Hi {{first_name}}, circling back on {{company}} — one link: https://example.com/case-study. unsubscribe",
    });
    expect(ids(hints)).not.toContain("link-density");
    expect(ids(hints)).not.toContain("body-all-caps");
  });
});
