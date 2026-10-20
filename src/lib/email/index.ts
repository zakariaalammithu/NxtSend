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
export { getEmailState, isResendWebhookConfigured, getEmailReplyTo } from "./state";
export { isSuppressed, checkSuppression, addSuppression } from "./suppression";
export {
  createSupabaseSuppressionStore,
  createDemoSuppressionStore,
  suppressionSourceLabel,
} from "./suppression-store";
export type { SuppressionStore, SuppressionEntry } from "./suppression-store";
export {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  getUnsubscribeSigningStatus,
  resolveUnsubscribeSigningKey,
  resolveUnsubscribeBaseUrl,
  buildUnsubscribeUrl,
  buildUnsubscribeHeaders,
  appendUnsubscribeFooter,
  maskEmail,
  DEMO_UNSUBSCRIBE_SIGNING_KEY,
} from "./unsubscribe";
export type {
  UnsubscribeClaims,
  UnsubscribeSigningStatus,
  UnsubscribeEnv,
  UnsubscribeUrlResolution,
  OutboundUnsubscribePrep,
} from "./unsubscribe";
export {
  performUnsubscribe,
  resolveUnsubscribeDeps,
  createSupabaseEnrollmentStopper,
  UNSUBSCRIBED_REASON,
} from "./unsubscribe-service";
export type {
  UnsubscribeServiceDeps,
  UnsubscribeOutcome,
} from "./unsubscribe-service";
export { ResendEmailAdapter } from "./resend";
export { GmailEmailAdapter, buildMimeMessage, deliverViaGmail } from "./gmail";
export type { GmailAdapterDeps } from "./gmail";
export {
  MicrosoftGraphEmailAdapter,
  buildGraphMessage,
  deliverViaGraph,
} from "./microsoft";
export type { MicrosoftGraphAdapterDeps } from "./microsoft";
export type { MailboxAdapterDeps, PreparedMailboxMessage } from "./mailbox-core";
export {
  MailboxRoutingAdapter,
  decideSendRoute,
} from "./mailbox-router";
export type { MailboxRoutingDeps, SendRouteDecision } from "./mailbox-router";
export {
  createCampaignRoutingAdapter,
  createConversationRoutingAdapter,
  resolveCampaignEmailAccount,
  resolveConversationEmailAccount,
} from "./mailbox-server";
export {
  verifySvixSignature,
  signSvixPayload,
  handleResendWebhook,
  RESEND_EVENT_STATUS,
} from "./webhook";
export type { EmailEventStore } from "./webhook";
export { createResendReceivedEmailFetcher, parseReceivedEmail } from "./receiving";
export { lintEmailContent } from "./content-lint";
export type { EmailLintHint, EmailLintInput } from "./content-lint";
export {
  checkDomainAuth,
  createDefaultTxtResolver,
  normalizeDomain,
  COMMON_DKIM_SELECTORS,
} from "./dns-check";
export type {
  DomainAuthCheck,
  ProtocolVerdict,
  DnsCheckState,
  DkimSelectorToCheck,
  TxtResolver,
} from "./dns-check";
export {
  listResendDomains,
  extractEmailDomain,
  matchEmailFromDomain,
  dkimSelectorsFromDomain,
} from "./domains";
export type {
  ResendDomainInfo,
  ResendDomainRecordInfo,
  FromDomainMatch,
  FromDomainMatchState,
} from "./domains";

let adapter: ResendEmailAdapter | null = null;

export function getEmailProvider(): ResendEmailAdapter {
  if (!adapter) adapter = new ResendEmailAdapter();
  return adapter;
}
