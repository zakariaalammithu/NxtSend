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

export const sendInboxReply = createAction({
  auth: nxtsendAuth,
  name: "sendInboxReply",
  displayName: "Send Inbox Reply (Email)",
  description: "Send an inbox reply — email channel only. LinkedIn replies are refused (422). idempotencyKey is required; duplicates replay, never re-send.",
  props: {
    id: Property.ShortText({ displayName: "Conversation ID", required: true }),
    body: Property.LongText({ displayName: "Reply body", required: true }),
    idempotencyKey: Property.ShortText({ displayName: "Idempotency key (unique per reply)", required: true }),
  },
  async run(context) {
    const { auth, propsValue: props } = context;
    return nxtsendRequest({
      accessToken: auth.access_token,
      method: HttpMethod.POST,
      path: "/conversations/{id}/replies".replace("{id}", props.id as string),
      
      body: { body: props.body, idempotencyKey: props.idempotencyKey },
    });
  },
});
