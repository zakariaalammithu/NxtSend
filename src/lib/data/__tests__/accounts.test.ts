import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryStorage, setDemoStorage } from "@/lib/data/demo-store";
import {
  createAccountsRepository,
  accountLimits,
  accountSenderVars,
  profileSenderVars,
  resolveSenderVars,
  seedDemoAccounts,
  withDefaultLimits,
  DEMO_EMAIL_ACCOUNT_ID,
  DEMO_LINKEDIN_ACCOUNT_ID,
} from "@/lib/data/accounts";
import { createCampaignsRepository } from "@/lib/data/campaigns";
import { DEMO_WORKSPACE_ID } from "@/lib/data/workspace";
import { DEFAULT_WARMUP_LIMITS } from "@/lib/data/audience-source";

beforeEach(() => {
  // Every test gets a fresh, empty demo store (seeded on first read).
  setDemoStorage(createMemoryStorage());
});

describe("DemoAccountsRepository — seeds", () => {
  it("seeds the demo LinkedIn persona + demo email account, warm-up on with Closely's default limits", async () => {
    const repo = createAccountsRepository("demo");
    const accounts = await repo.listAccounts(DEMO_WORKSPACE_ID);
    expect(accounts).toHaveLength(2);

    const linkedin = accounts.find((a) => a.id === DEMO_LINKEDIN_ACCOUNT_ID);
    expect(linkedin).toBeDefined();
    expect(linkedin?.channel).toBe("linkedin");
    expect(linkedin?.status).toBe("demo");
    expect(linkedin?.warmup_enabled).toBe(true);
    expect(linkedin?.daily_limits).toEqual(DEFAULT_WARMUP_LIMITS);
    expect(linkedin?.daily_limits.connection_requests).toBe(5);
    expect(linkedin?.daily_limits.messages).toBe(10);
    expect(linkedin?.sender_first_name).toBe("Alex");
    expect(linkedin?.sender_last_name).toBe("Vance");

    const email = accounts.find((a) => a.id === DEMO_EMAIL_ACCOUNT_ID);
    expect(email).toBeDefined();
    expect(email?.channel).toBe("email");
    expect(email?.status).toBe("demo");
    expect(email?.warmup_enabled).toBe(true);
    expect(email?.handle_or_email).toContain("nxtsend-demo.com");
  });

  it("scopes accounts to their workspace", async () => {
    const repo = createAccountsRepository("demo");
    expect(await repo.listAccounts("ws_someone_else")).toHaveLength(0);
    expect(
      await repo.getAccount("ws_someone_else", DEMO_LINKEDIN_ACCOUNT_ID)
    ).toBeNull();
  });
});

describe("DemoAccountsRepository — CRUD", () => {
  it("creates, updates (warm-up, limits, identity) and deletes persistently", async () => {
    const repo = createAccountsRepository("demo");
    const created = await repo.createAccount(DEMO_WORKSPACE_ID, {
      channel: "linkedin",
      provider: "linkedin",
      display_name: "Second Sender",
      handle_or_email: "linkedin.com/in/second",
    });
    expect(created.status).toBe("demo");
    expect(created.daily_limits).toEqual(DEFAULT_WARMUP_LIMITS);

    const toggled = await repo.updateAccount(created.id, {
      warmup_enabled: false,
    });
    expect(toggled.warmup_enabled).toBe(false);

    const limited = await repo.updateAccount(created.id, {
      daily_limits: { ...DEFAULT_WARMUP_LIMITS, connection_requests: 7 },
    });
    expect(limited.daily_limits.connection_requests).toBe(7);
    expect(limited.daily_limits.messages).toBe(10);

    const identified = await repo.updateAccount(created.id, {
      sender_first_name: "Sam",
      sender_job_title: "SDR",
    });
    expect(identified.sender_first_name).toBe("Sam");
    expect(identified.sender_job_title).toBe("SDR");

    // A second repository instance over the same store sees the writes.
    const reread = await createAccountsRepository("demo").getAccount(
      DEMO_WORKSPACE_ID,
      created.id
    );
    expect(reread?.warmup_enabled).toBe(false);
    expect(reread?.daily_limits.connection_requests).toBe(7);

    await repo.deleteAccount(DEMO_WORKSPACE_ID, created.id);
    expect(await repo.getAccount(DEMO_WORKSPACE_ID, created.id)).toBeNull();
  });

  it("throws when updating an unknown account", async () => {
    const repo = createAccountsRepository("demo");
    await expect(
      repo.updateAccount("acc_missing", { warmup_enabled: false })
    ).rejects.toThrow(/not found/);
  });
});

describe("limit + sender derivations", () => {
  it("withDefaultLimits merges partial stored values over the defaults and clamps junk", () => {
    expect(withDefaultLimits(undefined)).toEqual(DEFAULT_WARMUP_LIMITS);
    expect(withDefaultLimits({ connection_requests: 7 })).toEqual({
      ...DEFAULT_WARMUP_LIMITS,
      connection_requests: 7,
    });
    expect(
      withDefaultLimits({ messages: -3, profile_views: 2.9 }).messages
    ).toBe(0);
    expect(
      withDefaultLimits({ messages: -3, profile_views: 2.9 }).profile_views
    ).toBe(2);
  });

  it("accountLimits reads the account's stored limits, not the defaults", () => {
    const [seed] = seedDemoAccounts();
    const edited = {
      ...seed,
      daily_limits: { ...seed.daily_limits, find_email: 3 },
    };
    expect(accountLimits(edited).find_email).toBe(3);
    expect(accountLimits(edited).messages).toBe(10);
  });

  it("accountSenderVars maps the identity onto the {my_*} variables", () => {
    const [seed] = seedDemoAccounts();
    expect(accountSenderVars(seed)).toEqual({
      myFirstName: "Alex",
      myLastName: "Vance",
      myJobTitle: "Account Executive",
      myCompanyName: "NxtSend",
    });
  });

  it("resolveSenderVars: account identity wins, then the profile name, then nothing", () => {
    const [seed] = seedDemoAccounts();
    expect(resolveSenderVars(seed, "Someone Else").myFirstName).toBe("Alex");
    expect(resolveSenderVars(null, "Mary Jane Watson")).toEqual({
      myFirstName: "Mary",
      myLastName: "Jane Watson",
    });
    const emptyIdentity = {
      ...seed,
      sender_first_name: "",
      sender_last_name: "",
      sender_job_title: "",
      sender_company: "",
    };
    expect(resolveSenderVars(emptyIdentity, "Pat Lee").myFirstName).toBe(
      "Pat"
    );
    expect(resolveSenderVars(null, null)).toEqual({});
    expect(profileSenderVars("  ")).toEqual({});
  });
});

describe("Campaign account references (demo campaigns repository)", () => {
  it("persists sender_account_id / email_account_id on create, update and duplicate", async () => {
    const campaigns = createCampaignsRepository("demo");
    const created = await campaigns.createCampaign(DEMO_WORKSPACE_ID, {
      name: "Account wiring",
      type: "mixed",
      steps: [],
      sender_account_id: DEMO_LINKEDIN_ACCOUNT_ID,
      email_account_id: DEMO_EMAIL_ACCOUNT_ID,
    });
    expect(created.sender_account_id).toBe(DEMO_LINKEDIN_ACCOUNT_ID);
    expect(created.email_account_id).toBe(DEMO_EMAIL_ACCOUNT_ID);

    const fetched = await campaigns.getCampaign(DEMO_WORKSPACE_ID, created.id);
    expect(fetched?.sender_account_id).toBe(DEMO_LINKEDIN_ACCOUNT_ID);

    // Clearing the reference (what account deletion does) sticks.
    const cleared = await campaigns.updateCampaign(created.id, {
      sender_account_id: null,
    });
    expect(cleared.sender_account_id).toBeNull();
    expect(cleared.email_account_id).toBe(DEMO_EMAIL_ACCOUNT_ID);

    const copy = await campaigns.duplicateCampaign(
      DEMO_WORKSPACE_ID,
      created.id
    );
    expect(copy.sender_account_id).toBeNull();
    expect(copy.email_account_id).toBe(DEMO_EMAIL_ACCOUNT_ID);
  });
});
