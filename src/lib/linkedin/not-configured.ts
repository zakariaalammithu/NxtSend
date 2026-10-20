/**
 * The NotConfigured LinkedIn adapter — the ONLY implementation
 * behind the seam today (P5 Stage F).
 *
 * It exists so every caller (the executor's LinkedIn branch, the
 * inbox reply service, the Integration Center) can program against
 * LinkedInProviderAdapter and receive a structured, honest refusal
 * instead of an exception or a fabricated success:
 *
 *   - every send capability returns ok:false with code
 *     "provider_not_configured" and the shared explanation — no
 *     network call is made, nothing is recorded as sent;
 *   - getAccountHealth performs NO live check (there is no provider
 *     to ask): it returns the account's last recorded auth state
 *     (migration 013) with verifiedLive:false, so the UI can show the
 *     recorded health without pretending it was just confirmed.
 *
 * When the owner procures an approved provider, a vendor adapter
 * lands beside this file and createLinkedInAdapter() starts
 * returning it when that provider is configured. This implementation
 * remains the fallback for every other configuration.
 */

import type { DataMode } from "@/lib/data/mode";
import {
  describeLinkedInProvider,
  type LinkedInEnv,
} from "./state";
import type {
  LinkedInAccountHealth,
  LinkedInAccountRef,
  LinkedInActionResult,
  LinkedInConnectionRequestInput,
  LinkedInProviderAdapter,
  LinkedInSendMessageInput,
  ProviderState,
} from "./types";

export interface NotConfiguredLinkedInDeps {
  env?: LinkedInEnv;
  mode?: DataMode;
}

export class NotConfiguredLinkedInAdapter implements LinkedInProviderAdapter {
  readonly provider = "none";
  readonly providerLabel = "LinkedIn — approved provider required";
  private readonly deps: NotConfiguredLinkedInDeps;

  constructor(deps: NotConfiguredLinkedInDeps = {}) {
    this.deps = deps;
  }

  getState(): ProviderState {
    return describeLinkedInProvider(this.deps.env, this.deps.mode).state;
  }

  private refusal(): LinkedInActionResult {
    const description = describeLinkedInProvider(this.deps.env, this.deps.mode);
    return {
      ok: false,
      state: description.state,
      code: "provider_not_configured",
      message: description.message,
    };
  }

  async sendMessage(
    _input: LinkedInSendMessageInput
  ): Promise<LinkedInActionResult> {
    void _input; // refused before any input is read — see the header
    return this.refusal();
  }

  async sendConnectionRequest(
    _input: LinkedInConnectionRequestInput
  ): Promise<LinkedInActionResult> {
    void _input; // refused before any input is read — see the header
    return this.refusal();
  }

  async getAccountHealth(
    account: LinkedInAccountRef
  ): Promise<LinkedInAccountHealth> {
    return {
      accountId: account.id,
      authStatus: account.auth_status,
      lastSyncAt: account.last_sync_at,
      lastError: account.last_error,
      verifiedLive: false,
      detail:
        "No LinkedIn provider is configured, so this is the account's last recorded authorization state — it has not been re-checked with a provider.",
    };
  }
}
