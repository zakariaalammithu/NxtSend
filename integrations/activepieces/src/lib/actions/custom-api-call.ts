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

export const customApiCall = createAction({
  auth: nxtsendAuth,
  name: "customApiCall",
  displayName: "Custom API Call",
  description: "Call any NxtSend REST API v1 endpoint (relative path).",
  props: {
    method: Property.StaticDropdown({ displayName: "Method", required: true, options: { options: [
      { label: "GET", value: "GET" },
      { label: "POST", value: "POST" },
      { label: "PATCH", value: "PATCH" },
      { label: "PUT", value: "PUT" },
      { label: "DELETE", value: "DELETE" },
    ] } }),
    path: Property.ShortText({ displayName: "Relative path (e.g. /leads)", required: true }),
    body: Property.Json({ displayName: "JSON body (for POST/PATCH/PUT)", required: false }),
  },
  async run(context) {
    const { auth, propsValue: props } = context;
    return nxtsendRequest({
      accessToken: auth.access_token,
      method: (props.method as HttpMethod),
      path: props.path as string,
      
      body: props.body,
    });
  },
});
