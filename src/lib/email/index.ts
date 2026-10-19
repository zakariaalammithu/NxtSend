/**
 * Email module entry point.
 *
 * getEmailProvider() returns the Resend adapter; its behaviour is fully
 * driven by getEmailState() (demo / not_connected / configuration_required
 * / connected), so an unconfigured deployment can never send or pretend
 * to send.
 */

import { ResendEmailAdapter } from "./resend";

export * from "./types";
export { getEmailState, isResendWebhookConfigured } from "./state";
export { isSuppressed, checkSuppression, addSuppression } from "./suppression";
export { ResendEmailAdapter } from "./resend";
export {
  verifySvixSignature,
  signSvixPayload,
  handleResendWebhook,
  RESEND_EVENT_STATUS,
} from "./webhook";
export type { EmailEventStore } from "./webhook";
export { createResendReceivedEmailFetcher, parseReceivedEmail } from "./receiving";

let adapter: ResendEmailAdapter | null = null;

export function getEmailProvider(): ResendEmailAdapter {
  if (!adapter) adapter = new ResendEmailAdapter();
  return adapter;
}
