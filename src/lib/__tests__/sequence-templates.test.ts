import { describe, it, expect } from "vitest";
import { SEQUENCE_TEMPLATES, MESSAGE_TEMPLATES } from "../sequence-templates";
import { flattenSteps, getBranches } from "../sequence";

const EXPECTED_NAMES = [
  "Mutual Connection",
  "Profile Visit Connect",
  "Email & LinkedIn Outreach",
  "Standard Connect",
  "Connection Request Outreach",
  "Like-to-Connect",
  "Email Outreach Series",
  "Post Stumble Connect",
];

describe("sequence templates", () => {
  it("ships exactly Closely's 8 template names", () => {
    expect(SEQUENCE_TEMPLATES.map((tpl) => tpl.name)).toEqual(EXPECTED_NAMES);
  });

  it("builds fresh steps with unique ids on every call", () => {
    const a = SEQUENCE_TEMPLATES[0].build();
    const b = SEQUENCE_TEMPLATES[0].build();
    expect(a[0].id).not.toBe(b[0].id);
    expect(a.map((s) => s.step_type)).toEqual(b.map((s) => s.step_type));
  });

  it("structures match their names", () => {
    const byName = new Map(SEQUENCE_TEMPLATES.map((tpl) => [tpl.name, tpl]));
    const types = (name: string) =>
      flattenSteps(byName.get(name)!.build()).map((s) => s.step_type);

    expect(types("Like-to-Connect")).toEqual([
      "like_post",
      "view_profile",
      "connection_request",
    ]);
    expect(types("Email Outreach Series")).toEqual(["email", "email", "email"]);
    expect(types("Email & LinkedIn Outreach")).toContain("email");
    expect(types("Email & LinkedIn Outreach")).toContain("connection_request");
    expect(byName.get("Email & LinkedIn Outreach")!.channels).toEqual([
      "linkedin",
      "email",
    ]);
    expect(byName.get("Email Outreach Series")!.channels).toEqual(["email"]);
  });

  it("branching templates carry real Yes/No branch content", () => {
    const mutual = SEQUENCE_TEMPLATES.find((tpl) => tpl.name === "Mutual Connection")!;
    const cond = mutual.build().find((s) => s.step_type === "condition")!;
    const branches = getBranches(cond);
    expect(branches.yes.map((s) => s.step_type)).toEqual(["linkedin_message"]);
    expect(branches.no.map((s) => s.step_type)).toEqual(["view_profile", "like_post"]);
  });

  it("every connection-request note fits the 250-character limit", () => {
    for (const tpl of SEQUENCE_TEMPLATES) {
      for (const step of flattenSteps(tpl.build())) {
        if (step.step_type === "connection_request") {
          expect(step.content.length).toBeLessThanOrEqual(250);
        }
        expect(step.content).not.toMatch(/closely/i);
      }
    }
  });
});

describe("message templates (drawer library)", () => {
  it("offers originals for all three message step types", () => {
    for (const type of ["connection_request", "linkedin_message", "email"] as const) {
      const list = MESSAGE_TEMPLATES[type] ?? [];
      expect(list.length).toBeGreaterThanOrEqual(3);
      for (const item of list) {
        expect(item.content.length).toBeGreaterThan(0);
        expect(item.content).not.toMatch(/closely/i);
      }
    }
  });

  it("connection-request templates respect the 250-char limit", () => {
    for (const item of MESSAGE_TEMPLATES.connection_request ?? []) {
      expect(item.content.length).toBeLessThanOrEqual(250);
    }
  });

  it("email templates carry subjects", () => {
    for (const item of MESSAGE_TEMPLATES.email ?? []) {
      expect(item.subject).toBeTruthy();
    }
  });
});
