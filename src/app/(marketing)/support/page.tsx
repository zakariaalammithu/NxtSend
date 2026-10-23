import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CircleHelp,
  Inbox,
  KeyRound,
  Linkedin,
  Mail,
  PlugZap,
  Rocket,
  TriangleAlert,
  Wallet,
  Workflow,
} from "lucide-react";
import { HomeFaq, type HomeFaqItem } from "@/components/marketing/HomeFaq";

export const metadata: Metadata = {
  title: "Help & Support",
  description:
    "Guides and answers for NxtSend: getting started, campaigns, LinkedIn and email outreach setup, integrations, billing, and troubleshooting — plus how to reach the team at hello@nxtsend.com.",
};

/**
 * Help & Support (P8). Every instruction here describes behaviour the
 * product actually implements today; where a step depends on a
 * provider or an owner-side setup (a connected LinkedIn provider, a
 * verified sending domain, a connected provider), the guide says so
 * instead of inventing a flow. Billing is described as what it is —
 * per-seat Stripe subscriptions with plan usage limits; NxtSend has
 * no prepaid-balance system.
 */

interface GuideSection {
  id: string;
  icon: typeof Rocket;
  title: string;
  intro: string;
  steps?: readonly string[];
  bullets?: readonly string[];
}

const GUIDES: GuideSection[] = [
  {
    id: "getting-started",
    icon: Rocket,
    title: "Getting started",
    intro:
      "From a new account to a first campaign, the path inside NxtSend is the same for every workspace:",
    steps: [
      "Create your account on the sign-up page — your workspace is created with it.",
      "Connect your sending accounts: a Gmail or Outlook mailbox via OAuth, and/or a sending domain for email campaigns. LinkedIn profiles are added on the Accounts page.",
      "Import your leads on the Leads page. A CSV row needs an email address or a LinkedIn profile URL; duplicates on either are detected and skipped, and the import report shows you exactly what happened.",
      "Build a campaign with the four-step wizard — details, audience, sequence, launch review. Drafts save as you go and can be resumed later.",
      "Launch, then follow replies in the unified inbox. The Academy walks through the same flow in lesson form.",
    ],
  },
  {
    id: "account-login",
    icon: KeyRound,
    title: "Account & login help",
    intro: "The everyday account questions:",
    bullets: [
      "Forgot your password? Use \u201cForgot password\u201d on the login page — we email you a reset link, and the reset page lets you choose a new password.",
      "Your name and profile details live under Dashboard → Settings, and apply across your workspaces.",
      "Workspace roles matter for a few actions: connecting integrations and running a Test Connection require an owner or admin role in that workspace.",
      "You can delete a workspace — permanently, including its campaigns, lead data and sequences — from Dashboard → Settings → Delete this workspace. For deletion of your account itself, contact us at hello@nxtsend.com.",
      "If pages show sample data with a Demo Mode badge, you are looking at the public demo rather than a live workspace.",
    ],
  },
  {
    id: "campaigns",
    icon: Workflow,
    title: "Campaign setup & management",
    intro:
      "Campaigns are built in the wizard (Create → Audience → Sequence → Launch) and managed from the campaign list, which shows real performance per campaign:",
    bullets: [
      "Audiences come from your leads: import a CSV, or save an audience source definition (for example a LinkedIn search or a Sales Navigator list) and reuse it across campaigns.",
      "Sequences mix email steps and LinkedIn steps, with delays between them and A/B variants you can test against each other. Email steps send through your connected sending setup; see the LinkedIn section below for how LinkedIn steps behave.",
      "Stop rules protect you automatically: when a contact replies, bounces, complains or unsubscribes, their sequence stops.",
      "Each sending account has daily limits you control on the Accounts page — the executor respects them instead of blasting through.",
      "Pause, resume, archive or duplicate a campaign from its menu in the campaign list; drafts can be picked up where you left them.",
    ],
  },
  {
    id: "linkedin",
    icon: Linkedin,
    title: "LinkedIn outreach setup",
    intro:
      "You can prepare everything for LinkedIn outreach inside NxtSend today — audiences from LinkedIn profile URLs, saved source definitions, and sequences with connection-request, message and reaction steps. One part depends on a provider, and we label it honestly wherever it appears:",
    bullets: [
      "Actual LinkedIn sending runs through an authorised provider integration. Until a provider is connected to your workspace, the LinkedIn integration shows \u201cConfiguration Required\u201d and LinkedIn steps in a running sequence are recorded as skipped — with the reason shown — while email steps send normally. Nothing is silently simulated.",
      "You never share your LinkedIn password with the NxtSend team; account connection follows a guided sign-in flow.",
      "Rented outreach profiles (Avatars) are ordered inside the app and added straight to your workspace, ready to include in campaigns alongside your own profiles.",
      "Keep volumes reasonable and your targeting relevant: you are responsible for complying with LinkedIn's own terms for every account you connect, and for the messages your campaigns send.",
    ],
  },
  {
    id: "email",
    icon: Mail,
    title: "Email outreach setup",
    intro: "There are two ways to send email from NxtSend, and both are configured inside the product:",
    steps: [
      "Domain sending (via Resend): add your sending domain, publish the DNS records it asks for, then run the deliverability checker in the product — it reads your live SPF, DKIM and DMARC records and reports each one. The domain stays \u201cConfiguration Required\u201d until it verifies.",
      "Your own mailbox: connect a Gmail or Outlook mailbox with OAuth and select it as the campaign's sender. Sends and replies then run through that mailbox — there is no silent fallback to a different sender.",
      "Every campaign email carries an unsubscribe link, and unsubscribes, bounces and complaints are added to your suppression list automatically.",
    ],
  },
  {
    id: "integrations",
    icon: PlugZap,
    title: "Integrations configuration",
    intro:
      "Dashboard → Integration Center is where every integration is set up, and its status words mean specific things:",
    bullets: [
      "\u201cConnected and Verified\u201d — a real Test Connection check succeeded against the provider.",
      "\u201cConnected but Not Verified\u201d — configuration is present, but no successful check has run yet. Press Test Connection: it makes one safe, read-only call.",
      "\u201cConfiguration Required\u201d — something the integration needs (a key, a plan, an OAuth connection) is missing; the detail page lists exactly what.",
      "\u201cNot Connected\u201d, \u201cError\u201d and \u201cDemo Mode\u201d — no configuration yet, a check failed, or you are in the demo, where statuses are illustrative.",
      "Outbound webhooks are configured in the same center — see the Developers page for the events, payload and signature documentation.",
      "Some directory entries are intentionally honest about not existing yet: where a card says \u201cNot implemented\u201d, the workaround it names (usually CSV import/export) is the real path today.",
    ],
  },
  {
    id: "billing",
    icon: Wallet,
    title: "Billing & plans",
    intro:
      "NxtSend billing is subscription-based, handled through Stripe — you subscribe to a plan, and the plan's usage limits apply to your workspace. Your dashboard shows live usage against those limits, taken from your actual activity.",
    bullets: [
      "Outreach seats are $49 per seat per month. The Agency plan starts at $499 per month for 20 seats included, plus $20 per additional seat. Avatars are $387 per month with 3 profiles included.",
      "Yearly billing takes 25% off the monthly figures.",
      "There is no prepaid balance to top up: if you approach a plan limit, the dashboard's usage view shows it, and raising the limit means changing plan or seats.",
      "Payment is by card through Stripe's checkout; invoices and receipts come from Stripe.",
      "Questions about a charge or a plan change we cannot self-serve yet: email hello@nxtsend.com and we will sort it out.",
    ],
  },
  {
    id: "troubleshooting",
    icon: TriangleAlert,
    title: "Troubleshooting",
    intro: "The issues we see most, and what each one actually means:",
    bullets: [
      "Emails are not sending — check the campaign is launched (not a draft), the sending account's daily limit has not been reached, and the sending domain or mailbox is verified/connected. A contact on the suppression list is never emailed.",
      "LinkedIn steps show as skipped — expected until an authorised provider is connected to your workspace; the step's detail shows the reason. Email steps are unaffected.",
      "A mailbox shows its grant has expired — reconnect it from the Accounts page; OAuth grants can be revoked or expire on the provider's side.",
      "CSV import skipped rows — a row needs an email or a LinkedIn URL, and rows matching an existing lead on either are treated as duplicates. The import report lists both counts.",
      "Webhook deliveries are failing — see the Developers page: signature mismatches, non-2xx responses and the delivery log are covered there.",
    ],
  },
];

const FAQS: HomeFaqItem[] = [
  {
    question: "Is there a free trial?",
    answer:
      "Yes — the LinkedIn Outreach plan comes with a 14-day free trial, so you can run a first campaign before you pay anything.",
  },
  {
    question: "Can I try rental LinkedIn accounts for free?",
    answer:
      "Rented profiles are paid for upfront, so there is no free rental period. If a rented profile turns out not to be right for you, a 48-hour money-back window applies.",
  },
  {
    question: "Do I need to share the LinkedIn password for my account?",
    answer:
      "No. Connecting an account follows a guided sign-in flow inside NxtSend, and you never hand your LinkedIn password to our team.",
  },
  {
    question: "Why are the LinkedIn steps in my sequence marked as skipped?",
    answer:
      "LinkedIn sending runs through an authorised provider integration. Until one is connected to your workspace, LinkedIn steps are recorded as skipped with the reason shown, and the campaign keeps running its email steps. The step is never silently faked as sent.",
  },
  {
    question: "How do I stop a sequence for one person?",
    answer:
      "Often you do not have to: a reply, a bounce, a complaint or an unsubscribe stops that contact's sequence automatically. You can also remove the contact from the campaign audience, or pause the whole campaign from the campaign list.",
  },
  {
    question: "How do I get my leads back out of NxtSend?",
    answer:
      "Use Export CSV on the Leads page — your lead list downloads as a spreadsheet-ready file you can import anywhere else.",
  },
  {
    question: "Does NxtSend have a public API?",
    answer:
      "Not yet. The developer surface today is signed outbound webhooks — lead and campaign events delivered to your endpoint — documented on the Developers page. A public API is labelled Coming Soon there, never presented as available.",
  },
  {
    question: "How do I delete my workspace and its data?",
    answer:
      "Dashboard → Settings → Delete this workspace permanently deletes the workspace, including its campaigns, lead contact data and active sequences. For account-level deletion, email hello@nxtsend.com.",
  },
];

export default function SupportPage() {
  return (
    <div className="relative overflow-hidden bg-black-900">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-14 sm:pt-36">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-purple-600/10 blur-[140px]"
        />
        <div className="section-container relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-900/30 px-3.5 py-1 text-12 font-semibold text-purple-300">
              <CircleHelp className="h-3.5 w-3.5" />
              Help &amp; Support
            </p>
            <h1 className="mt-5 text-36 font-extrabold tracking-tight text-white sm:text-48">
              Get more out of NxtSend, faster
            </h1>
            <p className="mt-5 text-17 leading-relaxed text-black-300">
              Plain-language guides for the things people ask us about —
              written against the product as it works today. Where a
              feature depends on a provider or a setup step on your side,
              the guide says so instead of pretending.
            </p>
            <p className="mt-5 text-15 text-black-300">
              Still stuck? Email{" "}
              <a
                href="mailto:hello@nxtsend.com"
                className="font-semibold text-purple-300 hover:underline"
              >
                hello@nxtsend.com
              </a>{" "}
              or use the{" "}
              <Link href="/contact" className="font-semibold text-purple-300 hover:underline">
                contact form
              </Link>
              .
            </p>
          </div>

          {/* Quick nav */}
          <nav
            aria-label="Support topics"
            className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2"
          >
            {GUIDES.map((guide) => (
              <a
                key={guide.id}
                href={`#${guide.id}`}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-13 font-medium text-white/80 transition-colors hover:border-white/25 hover:text-white"
              >
                {guide.title}
              </a>
            ))}
            <a
              href="#faq"
              className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-13 font-medium text-white/80 transition-colors hover:border-white/25 hover:text-white"
            >
              FAQ
            </a>
          </nav>
        </div>
      </section>

      {/* ── Guides ───────────────────────────────────────────────────── */}
      <section className="relative border-t border-white/10 py-16">
        <div className="section-container">
          <div className="mx-auto max-w-4xl space-y-6">
            {GUIDES.map((guide) => (
              <article
                key={guide.id}
                id={guide.id}
                className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/[0.03] p-7 sm:p-9"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-purple-600/20 text-purple-300">
                    <guide.icon className="h-5 w-5" />
                  </span>
                  <h2 className="text-22 font-bold tracking-tight text-white sm:text-24">
                    {guide.title}
                  </h2>
                </div>
                <p className="mt-4 text-15 leading-relaxed text-black-300">
                  {guide.intro}
                </p>
                {guide.steps && (
                  <ol className="mt-5 space-y-3.5">
                    {guide.steps.map((step, i) => (
                      <li key={i} className="flex gap-3.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-12 font-bold text-white">
                          {i + 1}
                        </span>
                        <span className="text-14 leading-relaxed text-black-300">
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                {guide.bullets && (
                  <ul className="mt-5 list-disc space-y-2.5 pl-5 text-14 leading-relaxed text-black-300">
                    {guide.bullets.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                )}
                {guide.id === "getting-started" && (
                  <p className="mt-5 text-14 leading-relaxed text-black-300">
                    Prefer lessons? The{" "}
                    <Link href="/academy" className="font-semibold text-purple-300 hover:underline">
                      Academy
                    </Link>{" "}
                    covers setup and campaign craft in course form (new
                    video lessons are in production and labelled as such
                    there).
                  </p>
                )}
                {guide.id === "integrations" && (
                  <p className="mt-5 text-14 leading-relaxed text-black-300">
                    Setting up webhooks specifically? The{" "}
                    <Link href="/developers" className="font-semibold text-purple-300 hover:underline">
                      Developers page
                    </Link>{" "}
                    documents the events, the payload and signature
                    verification.
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section id="faq" className="relative scroll-mt-28 border-t border-white/10 py-16">
        <div className="section-container">
          <div className="mx-auto max-w-4xl">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-purple-600/20 text-purple-300">
                <BookOpenCheck className="h-5 w-5" />
              </span>
              <h2 className="text-24 font-bold tracking-tight text-white sm:text-28">
                Frequently asked questions
              </h2>
            </div>
            <div className="mt-8">
              <HomeFaq items={FAQS} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────────────── */}
      <section className="relative border-t border-white/10 py-16">
        <div className="section-container">
          <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-gradient-to-br from-[#2a1650] via-[#170b33] to-black-900 p-8 text-center sm:p-10">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white">
              <Inbox className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-24 font-bold text-white">
              Talk to a person
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-15 leading-relaxed text-white/70">
              If the guides above do not cover it, email us at{" "}
              <a
                href="mailto:hello@nxtsend.com"
                className="font-semibold text-white hover:underline"
              >
                hello@nxtsend.com
              </a>{" "}
              — tell us what you were trying to do and what happened
              instead, and include a screenshot if you have one.
            </p>
            <Link
              href="/contact"
              className="group mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-7 text-14 font-semibold text-black-900 transition hover:bg-white/90"
            >
              <span>Go to the contact page</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
