import type { Metadata } from "next";
import Link from "next/link";
import { Scale, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms governing use of the NxtSend outreach platform: accounts, acceptable use, per-seat subscriptions billed through Stripe, campaigns and messaging responsibilities, and third-party services.",
};

/**
 * Terms of Service (P8 rewrite). Grounded only in how the service
 * actually works today: per-seat subscriptions billed through Stripe
 * (Seat $49/mo; Agency from $499/mo for 20 seats + $20 per extra seat;
 * Avatars $387/mo; yearly billing at −25%), plan usage limits instead
 * of any credit balance, LinkedIn sending dependent on an authorised
 * connected provider, and the processors named in the Privacy Policy.
 * Deliberately absent: claims the product cannot back (proxy or
 * evasion technology, guaranteed deliverability or account safety,
 * invented plan names or refund promises beyond what is stated).
 */
export default function TermsPage() {
  const lastUpdated = "22 October 2026";

  return (
    <div className="relative min-h-screen overflow-x-clip bg-black-900 pt-12 pb-24 text-white">
      {/* Background glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-[400px] w-[750px] -translate-x-1/2 rounded-full bg-purple-600/10 blur-[140px]" />

      <div className="section-container relative z-10 max-w-4xl">
        {/* Header */}
        <div className="border-b border-black-700/80 pb-8 mb-10">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-900/30 px-3.5 py-1 text-12 font-semibold text-purple-300 mb-4">
            <Scale className="h-3.5 w-3.5 text-purple-400" />
            <span>Binding Agreement</span>
          </div>
          <h1 className="text-36 sm:text-48 font-extrabold tracking-tight text-white">
            Terms of Service
          </h1>
          <p className="mt-3 text-14 text-black-400">
            Last updated: {lastUpdated} &bull; Please read these terms carefully before accessing or using NxtSend.
          </p>
        </div>

        {/* Content Body */}
        <div className="prose prose-invert max-w-none space-y-10 text-15 leading-relaxed text-black-300">
          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              1. Acceptance of Terms
            </h2>
            <p>
              By creating an account, accessing the NxtSend website, or using the NxtSend application and any associated services (together, the &quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you use the Service on behalf of a company, organisation or agency, you represent that you have the authority to bind that entity to these Terms, and &quot;you&quot; refers to that entity.
            </p>
            <p>
              If you do not agree to these Terms, do not use the Service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              2. Account Registration and Security
            </h2>
            <p>
              To use the Service you must register an account and create or join a workspace. You agree to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-14 text-black-300">
              <li>Provide accurate, current and complete registration information, and keep it up to date.</li>
              <li>Keep your password and any connected-account credentials confidential, and not share your login with anyone outside your organisation.</li>
              <li>Notify us promptly at hello@nxtsend.com if you suspect unauthorised access to your account or workspace.</li>
              <li>Accept responsibility for all activity that occurs under your account and under the seats assigned to your team members.</li>
            </ul>
            <p>
              Certain administrative actions — including managing integrations — are restricted to workspace owners and admins. You are responsible for the roles you grant inside your workspace.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              3. Acceptable Use Policy
            </h2>
            <p>
              NxtSend is a tool for lawful business outreach. You must not use the Service to:
            </p>
            <div className="rounded-2xl border border-black-700 bg-black-800/50 p-6 space-y-3">
              <ul className="list-disc list-inside space-y-2 text-14 text-black-300">
                <li>Send spam or other unlawful communications, or contact people in violation of applicable anti-spam, privacy or electronic-communications law (such as CAN-SPAM, CASL or the GDPR, where they apply to you).</li>
                <li>Harass, threaten, defame, impersonate or defraud any person or organisation.</li>
                <li>Distribute malware, phishing content or malicious links.</li>
                <li>Upload or target lists containing sensitive personal data (such as health or financial data) or data about minors.</li>
                <li>Attempt to breach, probe or circumvent the Service&apos;s security, rate limits or access controls, or reverse-engineer the Service except where the law permits it.</li>
                <li>Use the Service in a way that breaches the terms of any third-party platform or service you connect to it.</li>
              </ul>
            </div>
            <p>
              We may investigate suspected violations and may suspend accounts under Section 9.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              4. Subscriptions, Billing and Plans
            </h2>
            <p>
              <strong>Plans and pricing:</strong> NxtSend is sold as per-seat subscriptions. Outreach seats are $49 per seat per month; the Agency plan starts at $499 per month including 20 seats, with additional seats at $20 per seat per month; Avatars are $387 per month including 3 profiles. Where yearly billing is offered, it is priced at a 25% discount to the monthly figures. Prices shown on the pricing page at the time of purchase apply to your subscription.
            </p>
            <p>
              <strong>Usage limits, not credits:</strong> Plans carry usage limits (for example lead, sending and account volumes) that are shown in your dashboard against your actual usage. NxtSend does not sell credits or maintain a prepaid balance for your account.
            </p>
            <p>
              <strong>Payment:</strong> Subscriptions are billed in advance on a recurring monthly or yearly cycle and are processed by Stripe. Your card details are collected and processed by Stripe; we do not receive or store your full card number.
            </p>
            <p>
              <strong>Changes and cancellation:</strong> You may change or cancel your subscription as described in the product; a cancellation takes effect at the end of the current paid billing period. Except where a specific offer states otherwise or the law requires it, fees already paid are non-refundable.
            </p>
            <p>
              <strong>Trials and specific offers:</strong> Any free trial, money-back window or promotional term applies only as expressly stated for that offer at the time you take it up.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              5. Campaigns, Messaging and User Responsibilities
            </h2>
            <p>
              You are solely responsible for your campaigns: the lists you upload, the content of your messages, and having a lawful basis to contact every person you reach. In particular:
            </p>
            <ul className="list-disc list-inside space-y-2 text-14 text-black-300">
              <li>Lead and contact data you import remains yours; you warrant that you obtained it lawfully and may use it for outreach.</li>
              <li>Every email campaign must honour unsubscribe requests. NxtSend attaches unsubscribe links to campaign email and maintains suppression lists, but the lawfulness of your sending remains your responsibility.</li>
              <li>LinkedIn activity is governed by LinkedIn&apos;s own terms, which you must comply with for every account you connect. NxtSend is not affiliated with LinkedIn, and LinkedIn may restrict or close accounts at its own discretion — an outcome we cannot prevent or reverse.</li>
              <li>Some capabilities depend on third-party connections — for example, LinkedIn sending runs through an authorised provider integration, and email warm-up runs through Instantly. Where a required connection is absent, the Service will say so and the affected steps will not be sent; we will not simulate delivery.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              6. Third-Party Services and Integrations
            </h2>
            <p>
              The Service relies on and connects to third-party services, including Supabase (hosting, database, authentication and file storage), Stripe (payments), Resend (email delivery), Google and Microsoft (mailbox connections you authorise via OAuth), and Instantly (email warm-up you connect). Your use of those services through NxtSend is also subject to their own terms and privacy policies. We are not responsible for a third-party service&apos;s availability, changes or actions, and a third party&apos;s outage may affect features that depend on it.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              7. Intellectual Property
            </h2>
            <p>
              We retain all right, title and interest in the Service, including its software, interfaces, branding and documentation. You retain full ownership of the data you upload to your workspace — including lead lists, campaign copy and communication history — and you grant us only the licence needed to process that data in order to operate the Service for you. Feedback you send us may be used to improve the Service without obligation to you.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              8. Service Availability and Limitations
            </h2>
            <p>
              We work to keep the Service available and reliable, but it is provided &quot;as is&quot; and &quot;as available&quot;: we do not guarantee uninterrupted operation, specific delivery or reply rates, or that any connected third-party platform will accept or continue to accept activity from your accounts. Features may change, and features labelled as planned, in development or &quot;Coming Soon&quot; are not promised by any particular date. A public demonstration deployment of the Service runs in Demo Mode with sample data and does not persist or act on real data.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              9. Account Suspension and Termination
            </h2>
            <p>
              You may stop using the Service at any time, cancel your subscription, and delete a workspace from its settings — which permanently deletes that workspace&apos;s campaigns, lead data and sequences. We may suspend or terminate your account, with notice where it is reasonable to give it, if you materially breach these Terms — for example by spamming, attempting to compromise the Service, or misusing connected third-party accounts. On termination, your right to use the Service ends; provisions that by their nature should survive (including Sections 7 and 10) survive termination.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              10. Limitation of Liability
            </h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NXTSEND AND ITS OFFICERS, EMPLOYEES AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA OR GOODWILL, OR FOR ACTIONS TAKEN BY THIRD-PARTY PLATFORMS (INCLUDING LINKEDIN) AGAINST YOUR ACCOUNTS.
            </p>
            <p>
              IN NO EVENT SHALL OUR TOTAL AGGREGATE LIABILITY ARISING FROM OR RELATING TO THE SERVICE EXCEED THE TOTAL AMOUNT PAID BY YOU TO NXTSEND IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM. Nothing in these Terms limits liability that cannot be limited under applicable law.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              11. Changes to These Terms
            </h2>
            <p>
              We may update these Terms from time to time. When we do, we will revise the &quot;Last updated&quot; date on this page, and material changes will be notified through the Service or by email before they take effect where reasonably possible. Continuing to use the Service after changes take effect means you accept the updated Terms.
            </p>
          </section>

          <section className="space-y-4 border-t border-black-700/80 pt-8">
            <h2 className="text-22 font-bold text-white tracking-tight">
              12. Contact Information
            </h2>
            <p>
              Questions about these Terms should be directed to:
            </p>
            <div className="rounded-2xl border border-black-700 bg-black-800/60 p-6 flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-14 font-semibold text-white">NxtSend</p>
                <p className="text-13 text-black-400">Office: Austin, TX 73301, USA</p>
                <a href="mailto:hello@nxtsend.com" className="text-14 text-purple-400 hover:underline">
                  hello@nxtsend.com
                </a>
              </div>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-xl border border-black-600 bg-black-800 px-5 py-2.5 text-13 font-medium text-white hover:bg-black-700"
              >
                <Mail className="h-4 w-4" />
                <span>Contact Desk</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
