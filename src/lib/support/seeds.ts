/**
 * Support knowledge-base seed content (P10 Stage E).
 *
 * Every entry is TRACED to a real source that already exists in the
 * product (support guide anchors, /developers facts,
 * src/lib/marketing-prices.ts, /contact, the legal pages) — the
 * `source` field records where, and a content test pins it. Nothing
 * here is invented copy.
 *
 * Exclusions enforced per the P10 audit (do not re-add):
 *  - NO credits / prepaid-balance content (NxtSend has none) — the one
 *    billing entry about credits exists only to DENY them.
 *  - NO "Academy API Docs" claim (contradicted by /developers).
 *  - NO white-label claim (contradicted by the pricing FAQ).
 *  - NO proxy claims (pages disagree; not seeded).
 *  - NO invented support hours, response times or SLAs anywhere.
 *
 * Seeding is idempotent: live mode applies these through the store's
 * first-run path with ON CONFLICT (slug) DO NOTHING semantics, so
 * admin edits are never overwritten by a re-run. Demo Mode carries the
 * same content as fixtures.
 */

import type { SupportSettings } from "./types";

export interface SeedCategory {
  slug: string;
  name: string;
  description: string;
  sort_order: number;
}

export interface SeedKnowledge {
  slug: string;
  category_slug: string;
  title: string;
  question: string;
  answer: string;
  keywords: string[];
  related_url: string | null;
  priority: number;
  /** Where this content comes from — traceability, not stored. */
  source: string;
}

export interface SeedSavedReply {
  title: string;
  category_slug: string | null;
  shortcut: string | null;
  body: string;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  { slug: "getting-started", name: "Getting Started", description: "First steps, accounts and workspaces.", sort_order: 1 },
  { slug: "account-login", name: "Account & Login", description: "Passwords, sign-in, roles and deletion.", sort_order: 2 },
  { slug: "campaigns", name: "Campaigns", description: "Building campaigns, leads and sequences.", sort_order: 3 },
  { slug: "linkedin", name: "LinkedIn", description: "LinkedIn outreach, profiles and Avatars.", sort_order: 4 },
  { slug: "email", name: "Email", description: "Domains, mailboxes and warm-up.", sort_order: 5 },
  { slug: "billing", name: "Billing", description: "Plans, pricing, trials and invoices.", sort_order: 6 },
  { slug: "integrations-developers", name: "Integrations & Developers", description: "Integration Center, webhooks and the API question.", sort_order: 7 },
  { slug: "contact-policies", name: "Contact & Policies", description: "How to reach us and the legal pages.", sort_order: 8 },
];

export const SEED_KNOWLEDGE: SeedKnowledge[] = [
  // ── Getting Started ──────────────────────────────────────────────
  {
    slug: "how-to-get-started",
    category_slug: "getting-started",
    title: "How do I get started with NxtSend?",
    question: "How do I get started with NxtSend?",
    answer:
      "The path is the same for every workspace: 1) Create your account on the sign-up page — your workspace is created with it. 2) Connect your sending accounts: a Gmail or Outlook mailbox via OAuth, and/or a sending domain for email campaigns; LinkedIn profiles are added on the Accounts page. 3) Import your leads on the Leads page. 4) Build a campaign with the four-step wizard (details, audience, sequence, launch review). 5) Launch, then follow replies in the unified inbox. The full guide is on the Support page.",
    keywords: ["start", "begin", "setup", "onboarding", "first campaign", "new account"],
    related_url: "/support#getting-started",
    priority: 70,
    source: "Support page → Getting started guide (/support#getting-started)",
  },
  {
    slug: "create-account-and-workspace",
    category_slug: "getting-started",
    title: "How do I create an account and workspace?",
    question: "How do I create an account and workspace?",
    answer:
      "Sign up on the sign-up page with your email and a password (or Continue with Google, when enabled). Your workspace is created with your account, and signing in takes you to the dashboard for that workspace. There is no separate workspace-creation step for a first account.",
    keywords: ["signup", "register", "create account", "new workspace", "join"],
    related_url: "/signup",
    priority: 65,
    source: "Support page → Getting started; signup flow",
  },

  // ── Account & Login ──────────────────────────────────────────────
  {
    slug: "forgot-password",
    category_slug: "account-login",
    title: "I forgot my password",
    question: "I forgot my password — how do I reset it?",
    answer:
      "Use “Forgot password” on the login page. We email you a reset link, and the reset page lets you choose a new password. If the email does not arrive, check your spam folder and that you entered the address your account uses.",
    keywords: ["password", "password reset", "login", "locked out", "reset link"],
    related_url: "/support#account-login",
    priority: 70,
    source: "Support page → Account & login help (/support#account-login)",
  },
  {
    slug: "google-sign-in",
    category_slug: "account-login",
    title: "How do I sign in with Google?",
    question: "How do I sign in with Google?",
    answer:
      "Use the “Continue with Google” button on the login or sign-up page. It takes you through Google's own sign-in and back to the page you were heading to, and a Google sign-up creates a normal account with the standard user role — never an admin account. The button works once the site owner has enabled the Google provider in the authentication settings; if Google sign-in reports a configuration problem, sign in with your email and password instead, or contact us and we will help.",
    keywords: ["google", "login", "oauth", "sign in with google", "continue with google"],
    related_url: "/login",
    priority: 65,
    source: "P10 Stage C (Google Sign-In built); provider enablement is owner-side in Supabase — answer worded accordingly",
  },
  {
    slug: "workspace-roles",
    category_slug: "account-login",
    title: "What do workspace roles control?",
    question: "What do workspace roles control?",
    answer:
      "Workspace roles matter for a few actions: connecting integrations and running a Test Connection require an owner or admin role in that workspace. Your name and profile details live under Dashboard → Settings and apply across your workspaces.",
    keywords: ["roles", "permissions", "owner", "admin role", "member", "access"],
    related_url: "/support#account-login",
    priority: 50,
    source: "Support page → Account & login help (/support#account-login)",
  },
  {
    slug: "delete-workspace-or-account",
    category_slug: "account-login",
    title: "How do I delete my workspace or account?",
    question: "How do I delete my workspace or account?",
    answer:
      "You can delete a workspace — permanently, including its campaigns, lead data and sequences — from Dashboard → Settings → Delete this workspace. For deletion of your account itself, contact us at hello@nxtsend.com.",
    keywords: ["delete workspace", "delete account", "remove workspace", "close account", "erase data"],
    related_url: "/support#account-login",
    priority: 55,
    source: "Support page → Account & login help + FAQ (/support#account-login)",
  },
  {
    slug: "what-is-demo-mode",
    category_slug: "account-login",
    title: "What is Demo Mode?",
    question: "What is Demo Mode?",
    answer:
      "If pages show sample data with a Demo Mode badge, you are looking at the public demo rather than a live workspace. Demo data is illustrative only — nothing you do there is saved to a real account.",
    keywords: ["demo", "demo mode", "sample data", "badge", "test data"],
    related_url: "/support#account-login",
    priority: 40,
    source: "Support page → Account & login help (/support#account-login)",
  },

  // ── Campaigns ────────────────────────────────────────────────────
  {
    slug: "set-up-a-campaign",
    category_slug: "campaigns",
    title: "How do I set up a campaign?",
    question: "How do I set up a campaign?",
    answer:
      "Campaigns are built in the wizard — Create → Audience → Sequence → Launch — and managed from the campaign list, which shows real performance per campaign. Audiences come from your leads; sequences mix email and LinkedIn steps with delays and optional A/B variants. Drafts save as you go and can be resumed later; pause, resume, archive or duplicate a campaign from its menu in the campaign list.",
    keywords: ["campaign", "create campaign", "wizard", "sequence", "audience", "launch"],
    related_url: "/support#campaigns",
    priority: 70,
    source: "Support page → Campaign setup & management (/support#campaigns)",
  },
  {
    slug: "import-leads",
    category_slug: "campaigns",
    title: "How do I import leads, and why were rows skipped?",
    question: "How do I import leads, and why were rows skipped?",
    answer:
      "Import a CSV on the Leads page. A row needs an email address or a LinkedIn profile URL; rows matching an existing lead on either are treated as duplicates and skipped. The import report shows exactly what happened — how many rows were imported and how many were skipped, and why.",
    keywords: ["import", "leads", "csv", "upload", "duplicates", "skipped rows", "audience"],
    related_url: "/support#campaigns",
    priority: 65,
    source: "Support page → Campaigns + Getting started + Troubleshooting",
  },
  {
    slug: "export-leads",
    category_slug: "campaigns",
    title: "How do I export my leads?",
    question: "How do I export my leads?",
    answer:
      "Use Export CSV on the Leads page — your lead list downloads as a spreadsheet-ready file you can import anywhere else.",
    keywords: ["export", "leads", "csv", "download", "backup"],
    related_url: "/support#faq",
    priority: 55,
    source: "Support page FAQ (/support#faq)",
  },
  {
    slug: "when-sequence-stops",
    category_slug: "campaigns",
    title: "When does a sequence stop for a contact?",
    question: "When does a sequence stop for a contact?",
    answer:
      "Stop rules protect you automatically: when a contact replies, bounces, complains or unsubscribes, their sequence stops. You can also remove the contact from the campaign audience, or pause the whole campaign from the campaign list.",
    keywords: ["sequence", "stop", "unsubscribe", "bounce", "reply stops", "pause sequence"],
    related_url: "/support#campaigns",
    priority: 60,
    source: "Support page → Campaigns + FAQ",
  },

  // ── LinkedIn ─────────────────────────────────────────────────────
  {
    slug: "linkedin-steps-skipped",
    category_slug: "linkedin",
    title: "Why are my LinkedIn steps marked as skipped?",
    question: "Why are my LinkedIn steps marked as skipped?",
    answer:
      "LinkedIn sending runs through an authorised provider integration. Until one is connected to your workspace, the LinkedIn integration shows “Configuration Required” and LinkedIn steps in a running sequence are recorded as skipped — with the reason shown — while email steps send normally. The step is never silently faked as sent.",
    keywords: ["linkedin", "skipped", "steps", "provider", "configuration required", "not sending"],
    related_url: "/support#linkedin",
    priority: 70,
    source: "Support page → LinkedIn outreach setup + FAQ (/support#linkedin)",
  },
  {
    slug: "linkedin-password",
    category_slug: "linkedin",
    title: "Do I need to share my LinkedIn password?",
    question: "Do I need to share my LinkedIn password?",
    answer:
      "No. Connecting an account follows a guided sign-in flow inside NxtSend, and you never hand your LinkedIn password to our team.",
    keywords: ["linkedin", "password", "share password", "credentials", "safe", "connect account"],
    related_url: "/support#faq",
    priority: 60,
    source: "Support page FAQ + homepage/pricing FAQ (/support#faq)",
  },
  {
    slug: "own-profiles-vs-renting",
    category_slug: "linkedin",
    title: "Can I use my own profiles instead of renting?",
    question: "Can I use my own LinkedIn profiles instead of renting?",
    answer:
      "Yes. You can connect your own LinkedIn profiles and use them in campaigns; renting profiles (Avatars) is optional, for teams that want additional outreach profiles without using their own.",
    keywords: ["own profiles", "my profiles", "renting", "avatars", "connect profile"],
    related_url: "/support#linkedin",
    priority: 55,
    source: "Homepage FAQ (per P10 audit trace)",
  },
  {
    slug: "sales-navigator",
    category_slug: "linkedin",
    title: "Does NxtSend work with Sales Navigator?",
    question: "Does NxtSend work with Sales Navigator?",
    answer:
      "Yes — NxtSend works with Sales Navigator audiences and lists. A Sales Navigator subscription is needed on at least one connected profile, per the pricing comparison.",
    keywords: ["sales navigator", "sales nav", "linkedin premium", "lists"],
    related_url: "/pricing",
    priority: 55,
    source: "Homepage/pricing FAQ + pricing comparison (per P10 audit trace)",
  },
  {
    slug: "what-are-avatars",
    category_slug: "linkedin",
    title: "What are Avatars / rented profiles?",
    question: "What are Avatars or rented profiles?",
    answer:
      "Avatars are rented LinkedIn outreach profiles. They are ordered inside the app and added straight to your workspace, ready to include in campaigns alongside your own profiles. Avatars are $387 per month with 3 profiles included.",
    keywords: ["avatars", "rented profiles", "rental", "profiles", "rent"],
    related_url: "/avatars",
    priority: 60,
    source: "Support page → LinkedIn + Billing; src/lib/marketing-prices.ts",
  },

  // ── Email ────────────────────────────────────────────────────────
  {
    slug: "send-from-own-domain",
    category_slug: "email",
    title: "How do I send from my own domain?",
    question: "How do I send email from my own domain?",
    answer:
      "Add your sending domain in the product, publish the DNS records it asks for (SPF, DKIM and DMARC), then run the deliverability checker — it reads your live records and reports each one. The domain stays “Configuration Required” until it verifies. Domain sending runs via Resend.",
    keywords: ["domain", "sending domain", "spf", "dkim", "dmarc", "dns", "deliverability", "resend"],
    related_url: "/support#email",
    priority: 65,
    source: "Support page → Email outreach setup (/support#email)",
  },
  {
    slug: "connect-gmail-or-outlook",
    category_slug: "email",
    title: "How do I connect a Gmail or Outlook mailbox?",
    question: "How do I connect a Gmail or Outlook mailbox?",
    answer:
      "Connect a Gmail or Outlook mailbox with OAuth from the Accounts page and select it as the campaign's sender. Sends and replies then run through that mailbox — there is no silent fallback to a different sender. If a mailbox shows its grant has expired, reconnect it from the Accounts page; OAuth grants can be revoked or expire on the provider's side.",
    keywords: ["gmail", "outlook", "mailbox", "connect email", "oauth", "microsoft 365", "sender"],
    related_url: "/support#email",
    priority: 65,
    source: "Support page → Email outreach setup + Troubleshooting (/support#email)",
  },
  {
    slug: "how-warmup-works",
    category_slug: "email",
    title: "How does warm-up work?",
    question: "How does email warm-up work?",
    answer:
      "Connect an Instantly account in the Integration Center to see per-mailbox warm-up status inside NxtSend. Warm-up itself runs on Instantly's network; NxtSend reports its status read-only. If warm-up shows “Unavailable”, no Instantly connection (or no API key) is configured for the workspace yet.",
    keywords: ["warmup", "warm-up", "instantly", "deliverability", "mailbox health"],
    related_url: "/support#email",
    priority: 55,
    source: "Support page → Email outreach setup + Troubleshooting (/support#email)",
  },

  // ── Billing ──────────────────────────────────────────────────────
  {
    slug: "how-much-does-nxtsend-cost",
    category_slug: "billing",
    title: "How much does NxtSend cost?",
    question: "How much does NxtSend cost?",
    answer:
      "Outreach seats are $49 per seat per month. The Agency plan is $499 per month including 20 seats, plus $20 per additional seat. Avatars are $387 per month with 3 profiles included. Yearly billing takes 25% off: a seat works out to $36.75 per month ($441 per year), Agency to $374.25 per month ($4,491 per year), and Avatars to $290.25 per month ($3,483 per year).",
    keywords: ["price", "pricing", "plans", "seats", "agency", "avatars", "yearly", "monthly", "subscription"],
    related_url: "/pricing",
    priority: 75,
    source: "src/lib/marketing-prices.ts + Support page → Billing & plans",
  },
  {
    slug: "free-trial",
    category_slug: "billing",
    title: "Is there a free trial?",
    question: "Is there a free trial?",
    answer:
      "Yes — the LinkedIn Outreach plan comes with a 14-day free trial, so you can run a first campaign before you pay anything. No card is required to start the trial.",
    keywords: ["trial", "free", "14 day", "try before buying"],
    related_url: "/support#faq",
    priority: 60,
    source: "Support page FAQ; homepage/pricing (per P10 audit trace)",
  },
  {
    slug: "rented-profile-trial",
    category_slug: "billing",
    title: "Can I try a rented profile for free?",
    question: "Can I try a rented profile for free?",
    answer:
      "Rented profiles are paid for upfront, so there is no free rental period. If a rented profile turns out not to be right for you, a 48-hour money-back window applies.",
    keywords: ["avatars", "rented profile", "trial", "free rental", "refund", "money back"],
    related_url: "/support#faq",
    priority: 50,
    source: "Support page FAQ (/support#faq)",
  },
  {
    slug: "credits-or-balance",
    category_slug: "billing",
    title: "Does NxtSend use credits or a prepaid balance?",
    question: "Does NxtSend use credits or a prepaid balance?",
    answer:
      "No. NxtSend billing is plan subscriptions with usage limits — there is no prepaid balance or credit system to top up. If you approach a plan limit, the dashboard's usage view shows it, and raising the limit means changing plan or seats.",
    keywords: ["credits", "balance", "top up", "prepaid", "usage limits", "quota"],
    related_url: "/support#billing",
    priority: 65,
    source: "Support page → Billing & plans (/support#billing)",
  },
  {
    slug: "billing-and-invoices",
    category_slug: "billing",
    title: "How am I billed and where are invoices?",
    question: "How am I billed and where are my invoices?",
    answer:
      "Billing is handled through Stripe: you subscribe to a plan and pay by card through Stripe's checkout. Invoices and receipts come from Stripe, and when Stripe is configured for your workspace the dashboard billing page lists your invoice history. For a specific charge on your own account, sign in and check Dashboard → Billing, or ask for a person here and the team can look with you.",
    keywords: ["billing", "invoices", "receipts", "stripe", "payment", "card", "charged"],
    related_url: "/support#billing",
    priority: 60,
    source: "Support page → Billing & plans; P9 dashboard invoice list",
  },

  // ── Integrations & Developers ────────────────────────────────────
  {
    slug: "integration-status-labels",
    category_slug: "integrations-developers",
    title: "What do the Integration Center status labels mean?",
    question: "What do the Integration Center status labels mean?",
    answer:
      "“Connected and Verified” means a real Test Connection check succeeded against the provider. “Connected but Not Verified” means configuration is present but no successful check has run yet — Test Connection makes one safe, read-only call. “Configuration Required” means something the integration needs (a key, a plan, an OAuth connection) is missing, and the detail page lists exactly what. “Not Connected”, “Error” and “Demo Mode” mean no configuration yet, a check failed, or you are in the demo, where statuses are illustrative.",
    keywords: ["integration", "status", "connected", "verified", "configuration required", "test connection", "labels"],
    related_url: "/support#integrations",
    priority: 60,
    source: "Support page → Integrations configuration (/support#integrations)",
  },
  {
    slug: "public-api",
    category_slug: "integrations-developers",
    title: "Does NxtSend have a public API?",
    question: "Does NxtSend have a public API?",
    answer:
      "Not yet. The developer surface today is signed outbound webhooks — lead and campaign events delivered to your endpoint — documented on the Developers page. A public API is labelled Coming Soon there, never presented as available.",
    keywords: ["api", "public api", "rest", "developers", "endpoints", "api keys"],
    related_url: "/developers",
    priority: 65,
    source: "Support page FAQ + /developers (API labelled Coming Soon)",
  },
  {
    slug: "webhook-events-and-signing",
    category_slug: "integrations-developers",
    title: "Which webhook events exist and how are they signed?",
    question: "Which webhook events exist and how are they signed and retried?",
    answer:
      "NxtSend sends three outbound webhook events: lead.created, campaign.created and campaign.status_changed. Deliveries are signed with an X-NxtSend-Signature HMAC-SHA256 header so your endpoint can verify they came from NxtSend, and failed deliveries are retried (at +5 and +30 minutes, up to 3 attempts). Webhooks are configured per workspace in the Integration Center; the Developers page documents the payload and signature verification.",
    keywords: ["webhooks", "events", "signature", "hmac", "retries", "lead.created", "campaign.created", "developers"],
    related_url: "/developers",
    priority: 60,
    source: "/developers (events, X-NxtSend-Signature HMAC-SHA256, retries)",
  },
  {
    slug: "voice-notes-delivery",
    category_slug: "integrations-developers",
    title: "How do voice notes reach recipients?",
    question: "How do voice notes reach recipients?",
    answer:
      "Voice notes are recorded inside NxtSend and delivered as email attachments. There is no LinkedIn voice-note delivery — a voice note always reaches the recipient by email.",
    keywords: ["voice notes", "voice", "audio", "attachment", "record"],
    related_url: "/pricing",
    priority: 50,
    source: "Pricing comparison + project record (email attachments only)",
  },

  // ── Contact & Policies ───────────────────────────────────────────
  {
    slug: "how-to-contact",
    category_slug: "contact-policies",
    title: "How do I contact NxtSend?",
    question: "How do I contact NxtSend?",
    answer:
      "Email us at hello@nxtsend.com, use the contact form on the Contact page, or chat here and ask for a person. Our office is in Austin, TX 73301, USA.",
    keywords: ["contact", "email", "reach", "support", "hello@nxtsend.com", "office", "address"],
    related_url: "/contact",
    priority: 65,
    source: "Contact page (/contact): hello@nxtsend.com, Office — Austin, TX 73301, USA",
  },
  {
    slug: "legal-policies",
    category_slug: "contact-policies",
    title: "Where are the Terms, Privacy and Cookie policies?",
    question: "Where are the Terms, Privacy and Cookie policies?",
    answer:
      "The Terms & Conditions are at /terms, the Privacy Policy at /privacy and the Cookie Policy at /cookies — all linked in the website footer.",
    keywords: ["terms", "privacy", "cookies", "legal", "policy", "conditions"],
    related_url: "/terms",
    priority: 45,
    source: "Legal pages /terms, /privacy, /cookies",
  },
];

export const SEED_SAVED_REPLIES: SeedSavedReply[] = [
  {
    title: "Billing help — where invoices live",
    category_slug: "billing",
    shortcut: "billing-invoices",
    body: "Billing runs through Stripe: invoices and receipts come from Stripe, and when Stripe is configured for your workspace, Dashboard → Billing lists your invoice history. If a specific charge looks wrong, tell us the date and amount shown on the invoice and we'll look into it with you.",
  },
  {
    title: "Login troubleshooting",
    category_slug: "account-login",
    shortcut: "login-help",
    body: "A few quick checks: 1) Make sure you're signing in with the email your account uses. 2) If you've forgotten the password, use “Forgot password” on the login page — the reset link arrives by email. 3) If Google sign-in reports a configuration problem, email-and-password sign-in still works. Tell us what you see on screen and we'll take it from there.",
  },
  {
    title: "Integration status explainer",
    category_slug: "integrations-developers",
    shortcut: "integration-status",
    body: "In Dashboard → Integration Center, “Configuration Required” means a key, plan or OAuth connection the integration needs is still missing — the integration's detail page lists exactly what. After adding it, run Test Connection: it makes one safe, read-only call and only a successful check shows “Connected and Verified”.",
  },
  {
    title: "LinkedIn steps skipped explainer",
    category_slug: "linkedin",
    shortcut: "linkedin-skipped",
    body: "LinkedIn steps show as skipped until an authorised LinkedIn provider is connected to your workspace — that's expected behaviour, not a fault, and nothing is silently simulated. Your email steps keep sending in the meantime, and each skipped step shows its reason in the campaign view.",
  },
  {
    title: "Escalation acknowledgement",
    category_slug: null,
    shortcut: "ack",
    body: "Thanks — I've got your message and I'm looking into it now. If I need anything else from you I'll ask here, so you can keep this conversation open.",
  },
  {
    title: "Closing — anything else?",
    category_slug: null,
    shortcut: "closing-check",
    body: "Glad that helped. I'll mark this conversation resolved — if anything else comes up, just send another message here and we'll pick it up again.",
  },
];

/** Default settings singleton (mirrors the migration 019 defaults). */
export const DEFAULT_SUPPORT_SETTINGS: Omit<SupportSettings, "updated_by" | "updated_at"> = {
  id: "global",
  ai_kb_enabled: true,
  ai_enhancement_enabled: false,
  live_support_enabled: true,
  allow_user_escalation: true,
  display_name: "NxtSend Support",
  greeting: "Hi there — ask anything about NxtSend, or ask for a person any time.",
  welcome_message:
    "Welcome to NxtSend Support. Ask a question about getting started, campaigns, billing or integrations and I'll answer from our help content — or ask for a person and I'll hand the conversation over.",
  offline_message:
    "Our support team isn't available right now, but your message is saved — leave it here (with an email address if you're visiting as a guest) and we'll reply. You can also email us at hello@nxtsend.com.",
  closing_message:
    "Thanks for chatting with NxtSend Support. If anything else comes up, just send another message and we'll pick it up.",
  support_email: "hello@nxtsend.com",
};
