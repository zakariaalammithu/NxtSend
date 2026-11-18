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

export const createLead = createAction({
  auth: nxtsendAuth,
  name: "createLead",
  displayName: "Create Lead",
  description: "Create a lead. Dedups by email — returns the existing lead with duplicate: true instead of a second row.",
  props: {
    email: Property.ShortText({ displayName: "Email", required: true }),
    first_name: Property.ShortText({ displayName: "First name", required: false }),
    last_name: Property.ShortText({ displayName: "Last name", required: false }),
    company: Property.ShortText({ displayName: "Company", required: false }),
    job_title: Property.ShortText({ displayName: "Job title", required: false }),
    linkedin_url: Property.ShortText({ displayName: "LinkedIn URL", required: false }),
  },
  async run(context) {
    const { auth, propsValue: props } = context;
    return nxtsendRequest({
      accessToken: auth.access_token,
      method: HttpMethod.POST,
      path: "/leads",
      
      body: {
        email: props.email,
        first_name: props.first_name,
        last_name: props.last_name,
        company: props.company,
        job_title: props.job_title,
        linkedin_url: props.linkedin_url,
      },
    });
  },
});
