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

export const updateCampaign = createAction({
  auth: nxtsendAuth,
  name: "updateCampaign",
  displayName: "Update Campaign",
  description: "Update a draft campaign.",
  props: {
    id: Property.ShortText({ displayName: "Campaign ID", required: true }),
    name: Property.ShortText({ displayName: "Campaign name", required: false }),
  },
  async run(context) {
    const { auth, propsValue: props } = context;
    return nxtsendRequest({
      accessToken: auth.access_token,
      method: HttpMethod.PATCH,
      path: "/campaigns/{id}".replace("{id}", props.id as string),
      
      body: { name: props.name },
    });
  },
});
