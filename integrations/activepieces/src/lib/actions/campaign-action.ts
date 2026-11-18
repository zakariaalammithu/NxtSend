/**
 * NxtSend piece.
 *
 * Build-verified 2026-11-19: tsc clean + runtime construct against
 * @activepieces/pieces-framework 0.32.0 (17 actions, 9 triggers,
 * OAuth2 auth). NOT installed in any Activepieces instance, NOT
 * submitted to Activepieces. Build with
 * `npm install && npm run build` (see README.md).
 *
 * No secrets in this file. Auth is OAuth 2.0 (src/auth.ts) against
 * NxtSend's shared authorization server; the client comes from the
 * one-time Dynamic Client Registration call.
 */
import { createAction, Property } from "@activepieces/pieces-framework";
import { HttpMethod } from "@activepieces/pieces-common";
import { nxtsendAuth } from "../../auth";
import { nxtsendRequest } from "../common";

export const campaignAction = createAction({
  auth: nxtsendAuth,
  name: "campaignAction",
  displayName: "Pause / Resume / Stop / Archive Campaign",
  description: "Lifecycle transition. Pause needs an active campaign, resume needs paused, stop/archive refuse an already-archived campaign.",
  props: {
    id: Property.ShortText({ displayName: "Campaign ID", required: true }),
    action: Property.StaticDropdown({ displayName: "Action", required: true, options: { options: [
      { label: "Pause", value: "pause" },
      { label: "Resume", value: "resume" },
      { label: "Stop", value: "stop" },
      { label: "Archive", value: "archive" },
    ] } }),
  },
  async run(context) {
    const { auth, propsValue: props } = context;
    return nxtsendRequest({
      accessToken: auth.access_token,
      method: HttpMethod.POST,
      path: "/campaigns/{id}/{action}".replace("{id}", props.id as string).replace("{action}", props.action as string),
      
      body: undefined,
    });
  },
});
