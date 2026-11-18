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

export const updateLead = createAction({
  auth: nxtsendAuth,
  name: "updateLead",
  displayName: "Update Lead",
  description: "Update a lead's fields or status. Emits lead.updated.",
  props: {
    id: Property.ShortText({ displayName: "Lead ID", required: true }),
    status: Property.StaticDropdown({ displayName: "Status", required: false, options: { options: [
      { label: "New", value: "new" },
      { label: "Contacted", value: "contacted" },
      { label: "Replied", value: "replied" },
      { label: "Converted", value: "converted" },
      { label: "Unresponsive", value: "unresponsive" },
    ] } }),
    first_name: Property.ShortText({ displayName: "First name", required: false }),
    last_name: Property.ShortText({ displayName: "Last name", required: false }),
    company: Property.ShortText({ displayName: "Company", required: false }),
  },
  async run(context) {
    const { auth, propsValue: props } = context;
    return nxtsendRequest({
      accessToken: auth.access_token,
      method: HttpMethod.PATCH,
      path: "/leads/{id}".replace("{id}", props.id as string),
      
      body: {
        status: props.status,
        first_name: props.first_name,
        last_name: props.last_name,
        company: props.company,
      },
    });
  },
});
