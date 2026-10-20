import { describe, it, expect } from "vitest";
import {
  createStepDraft,
  getBranches,
  withBranches,
  normalizeStep,
  getListAt,
  getStepAt,
  updateStepAt,
  insertStepAt,
  removeStepAt,
  duplicateStepAt,
  flattenSteps,
  countSteps,
  delayParts,
  delayFromParts,
  delayLabel,
  campaignStepToDraft,
  draftToPayload,
  type SequenceStepDraft,
} from "../sequence";
import type { CampaignStep } from "@/types";

function conditionWithBranches(): SequenceStepDraft {
  const yesMsg = createStepDraft("linkedin_message");
  yesMsg.content = "Yes branch hello {{first_name}}";
  const noLike = createStepDraft("like_post");
  return withBranches(createStepDraft("condition"), {
    yes: [yesMsg],
    no: [noLike],
  });
}

describe("sequence model — condition branches", () => {
  it("stores branch step-lists inside the condition step's config", () => {
    const cond = conditionWithBranches();
    const branches = cond.config.branches as {
      yes: SequenceStepDraft[];
      no: SequenceStepDraft[];
    };
    expect(branches.yes).toHaveLength(1);
    expect(branches.yes[0].step_type).toBe("linkedin_message");
    expect(branches.no[0].step_type).toBe("like_post");
  });

  it("round-trips branches through JSON (the config JSONB path)", () => {
    const steps = [createStepDraft("connection_request"), conditionWithBranches()];
    const revived = (JSON.parse(JSON.stringify(steps)) as SequenceStepDraft[]).map(
      normalizeStep
    );
    const branches = getBranches(revived[1]);
    expect(branches.yes).toHaveLength(1);
    expect(branches.yes[0].content).toBe("Yes branch hello {{first_name}}");
    expect(branches.no).toHaveLength(1);
    expect(countSteps(revived)).toBe(4);
  });

  it("round-trips through repository payloads (draft → payload → stored step → draft)", () => {
    const steps = [conditionWithBranches()];
    const payload = draftToPayload(steps[0]);
    const stored: CampaignStep = {
      id: "step_db_1",
      campaign_id: "cmp_1",
      step_order: 1,
      step_type: payload.step_type,
      delay_hours: payload.delay_hours,
      subject: payload.subject,
      content: payload.content,
      config: JSON.parse(JSON.stringify(payload.config)) as Record<string, unknown>,
    };
    const draft = campaignStepToDraft(stored);
    const branches = getBranches(draft);
    expect(branches.yes[0].content).toBe("Yes branch hello {{first_name}}");
    expect(branches.no[0].step_type).toBe("like_post");
  });
});

describe("sequence model — path operations", () => {
  it("addresses steps at the root and inside branches", () => {
    const steps = [createStepDraft("connection_request"), conditionWithBranches()];
    expect(getStepAt(steps, "0")?.step_type).toBe("connection_request");
    expect(getStepAt(steps, "1.yes.0")?.step_type).toBe("linkedin_message");
    expect(getStepAt(steps, "1.no.0")?.step_type).toBe("like_post");
    expect(getListAt(steps, "1.yes")).toHaveLength(1);
  });

  it("inserts, updates, duplicates and removes inside a branch without touching siblings", () => {
    let steps = [conditionWithBranches()];
    steps = insertStepAt(steps, "0.no", 1, createStepDraft("view_profile"));
    expect(getListAt(steps, "0.no")).toHaveLength(2);
    expect(getListAt(steps, "0.yes")).toHaveLength(1);

    steps = updateStepAt(steps, "0.no.1", { delay_hours: 72 });
    expect(getStepAt(steps, "0.no.1")?.delay_hours).toBe(72);

    const dup = duplicateStepAt(steps, "0.yes.0");
    steps = dup.steps;
    expect(dup.copyPath).toBe("0.yes.1");
    expect(getListAt(steps, "0.yes")).toHaveLength(2);
    // The copy is a deep copy with fresh ids (branch steps included).
    expect(getStepAt(steps, "0.yes.1")?.id).not.toBe(getStepAt(steps, "0.yes.0")?.id);

    steps = removeStepAt(steps, "0.no.0");
    expect(getListAt(steps, "0.no")).toHaveLength(1);
    expect(getListAt(steps, "0.no")[0].step_type).toBe("view_profile");
  });

  it("flattenSteps walks root steps then branch steps, depth-first", () => {
    const steps = [createStepDraft("email"), conditionWithBranches()];
    expect(flattenSteps(steps).map((s) => s.step_type)).toEqual([
      "email",
      "condition",
      "linkedin_message",
      "like_post",
    ]);
  });
});

describe("sequence model — delays", () => {
  it("formats delays the Closely way", () => {
    expect(delayLabel(0)).toBe("Immediately");
    expect(delayLabel(1)).toBe("Wait for 1 hour");
    expect(delayLabel(5)).toBe("Wait for 5 hours");
    expect(delayLabel(24)).toBe("Wait for 1 day");
    expect(delayLabel(72)).toBe("Wait for 3 days");
  });

  it("converts between hours and day/hour parts", () => {
    expect(delayParts(48)).toEqual({ value: 2, unit: "days" });
    expect(delayParts(7)).toEqual({ value: 7, unit: "hours" });
    expect(delayFromParts(2, "days")).toBe(48);
    expect(delayFromParts(3, "hours")).toBe(3);
  });
});

describe("sequence model — new step factory", () => {
  it("creates the new LinkedIn touch steps with no message body", () => {
    for (const type of ["like_post", "view_profile", "endorse_skills"] as const) {
      const step = createStepDraft(type);
      expect(step.step_type).toBe(type);
      expect(step.content).toBe("");
    }
  });

  it("keeps the starter connection note within the 250-char limit", () => {
    expect(createStepDraft("connection_request").content.length).toBeLessThanOrEqual(250);
  });
});
