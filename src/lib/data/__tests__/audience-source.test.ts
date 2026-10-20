import { describe, it, expect } from "vitest";
import {
  DEFAULT_WARMUP_LIMITS,
  WARMUP_LIMIT_ROWS,
  maxPeopleForSource,
  validateLinkedinSource,
  audienceSourceLabel,
} from "@/lib/data/audience-source";

describe("DEFAULT_WARMUP_LIMITS", () => {
  it("matches Closely's documented warm-up schedule (5/10/20/20/20/20)", () => {
    expect(DEFAULT_WARMUP_LIMITS).toEqual({
      connection_requests: 5,
      messages: 10,
      profile_views: 20,
      like_post: 20,
      endorse_skills: 20,
      find_email: 20,
    });
    // One display row per limit, in Closely's order.
    expect(WARMUP_LIMIT_ROWS.map((r) => r.key)).toEqual([
      "connection_requests",
      "messages",
      "profile_views",
      "like_post",
      "endorse_skills",
      "find_email",
    ]);
  });
});

describe("validateLinkedinSource — linkedin_search", () => {
  it("accepts basic, Sales Navigator and Recruiter search URLs", () => {
    expect(
      validateLinkedinSource(
        "linkedin_search",
        "https://www.linkedin.com/search/results/people/?keywords=ceo",
        500
      )
    ).toBeNull();
    expect(
      validateLinkedinSource(
        "linkedin_search",
        "https://www.linkedin.com/sales/search/people/",
        2000
      )
    ).toBeNull();
    expect(
      validateLinkedinSource(
        "linkedin_search",
        "https://www.linkedin.com/talent/search/",
        2500
      )
    ).toBeNull();
  });

  it("rejects non-LinkedIn and non-search URLs", () => {
    expect(
      validateLinkedinSource("linkedin_search", "https://example.com/search/", 10)
    ).toMatch(/linkedin\.com/);
    expect(
      validateLinkedinSource(
        "linkedin_search",
        "https://www.linkedin.com/in/jane-doe",
        10
      )
    ).toMatch(/doesn't look like a LinkedIn search/);
    expect(validateLinkedinSource("linkedin_search", "not a url", 10)).toMatch(
      /not a valid URL/
    );
    expect(validateLinkedinSource("linkedin_search", "", 10)).toMatch(
      /Paste a LinkedIn link/
    );
  });

  it("enforces the documented caps: 1000 basic, 2500 Sales/Recruiter", () => {
    expect(maxPeopleForSource("linkedin_search", "https://www.linkedin.com/search/results/people/")).toBe(1000);
    expect(maxPeopleForSource("linkedin_search", "https://www.linkedin.com/sales/search/people/")).toBe(2500);
    expect(
      validateLinkedinSource(
        "linkedin_search",
        "https://www.linkedin.com/search/results/people/",
        1001
      )
    ).toMatch(/maximum is 1,000/);
    expect(
      validateLinkedinSource(
        "linkedin_search",
        "https://www.linkedin.com/sales/search/people/",
        2501
      )
    ).toMatch(/maximum is 2,500/);
  });

  it("rejects a missing or non-positive count", () => {
    expect(
      validateLinkedinSource(
        "linkedin_search",
        "https://www.linkedin.com/search/results/people/",
        0
      )
    ).toMatch(/at least 1/);
  });
});

describe("validateLinkedinSource — post / event / group", () => {
  it("accepts matching URL shapes", () => {
    expect(
      validateLinkedinSource(
        "post_engagement",
        "https://www.linkedin.com/posts/activity-123",
        100
      )
    ).toBeNull();
    expect(
      validateLinkedinSource(
        "event_attendees",
        "https://www.linkedin.com/events/123456/",
        100
      )
    ).toBeNull();
    expect(
      validateLinkedinSource(
        "group_members",
        "https://www.linkedin.com/groups/123456/",
        100
      )
    ).toBeNull();
  });

  it("rejects mismatched URL shapes per tab", () => {
    expect(
      validateLinkedinSource(
        "post_engagement",
        "https://www.linkedin.com/groups/123/",
        10
      )
    ).toMatch(/doesn't look like a LinkedIn post/);
    expect(
      validateLinkedinSource(
        "event_attendees",
        "https://www.linkedin.com/posts/abc",
        10
      )
    ).toMatch(/doesn't look like a LinkedIn event/);
    expect(
      validateLinkedinSource(
        "group_members",
        "https://www.linkedin.com/events/123/",
        10
      )
    ).toMatch(/doesn't look like a LinkedIn group/);
  });
});

describe("audienceSourceLabel", () => {
  it("labels every source type", () => {
    expect(audienceSourceLabel("csv")).toBe("CSV file");
    expect(audienceSourceLabel("my_network")).toBe("CSV file · My Network");
    expect(audienceSourceLabel("linkedin_search")).toBe("LinkedIn Search");
    expect(audienceSourceLabel("group_members")).toBe("Group members");
  });
});
