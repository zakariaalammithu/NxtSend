import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Scale, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Review the terms, conditions, and acceptable use guidelines governing the NxtSend outreach automation platform.",
};

export default function TermsPage() {
  const lastUpdated = "October 2026";

  return (
    <div className="relative min-h-screen bg-black-900 pt-12 pb-24 text-white">
      {/* Background glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-[400px] w-[750px] -translate-x-1/2 rounded-full bg-purple-600/10 blur-[140px]" />

      <div className="section-container relative z-10 max-w-4xl">
        {/* Prominent Legal Disclaimer Banner */}
        <div className="mb-10 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-5 sm:p-6 backdrop-blur-md">
          <div className="flex items-start gap-3.5">
            <AlertTriangle className="h-6 w-6 shrink-0 text-yellow-400 mt-0.5" />
            <div>
              <h2 className="text-15 font-bold text-yellow-300">
                ⚠️ Legal Notice & Draft Template
              </h2>
              <p className="mt-1 text-13 leading-relaxed text-yellow-200/90">
                This is a draft template provided for demonstrative and structural purposes. Have a qualified legal professional review and adapt this document to your specific commercial operations and jurisdiction prior to publication.
              </p>
            </div>
          </div>
        </div>

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
              By signing up for an account, accessing nxtsend.com, or using any associated services, APIs, or software provided by NxtSend (&quot;NxtSend&quot;, &quot;we&quot;, &quot;us&quot;), you (&quot;Customer&quot;, &quot;User&quot;) agree to be bound by these Terms of Service (&quot;Terms&quot;). If you are entering into this agreement on behalf of a company, organization, or agency, you represent that you have full legal authority to bind that entity.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              2. User Accounts & Responsibilities
            </h2>
            <p>
              To access the platform, you must create a workspace account. You agree to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-14 text-black-300">
              <li>Provide accurate, current, and complete registration credentials.</li>
              <li>Maintain the security of your authentication tokens and workspace passwords.</li>
              <li>Notify NxtSend immediately of any unauthorized breach or account access.</li>
              <li>Accept responsibility for all activities occurring under your team member seats.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              3. Acceptable Use & Platform Compliance
            </h2>
            <p>
              NxtSend provides multi-account automation tools intended for lawful B2B sales development and networking. You strictly agree not to use the platform to:
            </p>
            <div className="rounded-2xl border border-black-700 bg-black-800/50 p-6 space-y-3">
              <ul className="list-disc list-inside space-y-2 text-14 text-black-300">
                <li>Send unsolicited commercial bulk spam in violation of CAN-SPAM, CASL, or the GDPR.</li>
                <li>Harass, threaten, defame, impersonate, or defraud any individual or organization.</li>
                <li>Distribute malicious links, spyware, trojans, or phishing payloads.</li>
                <li>Scrape, harvest, or collect personal sensitive health, financial, or minor data.</li>
                <li>Circumvent or reverse-engineer NxtSend security architecture or account rate limits.</li>
              </ul>
            </div>
            <p className="text-14 text-black-400 mt-2">
              <strong>Third-Party Platform Rules:</strong> You acknowledge that LinkedIn is an independent third-party platform with its own Terms of Service. While NxtSend implements human-like delays and residential proxy routing designed to respect platform safety thresholds, you are responsible for maintaining reasonable sending volumes on your accounts.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              4. Subscriptions, Invoicing & Cancellations
            </h2>
            <p>
              <strong>Free Trial:</strong> New workspaces receive a 14-day free trial. No credit card is required. At the conclusion of the trial, continued access requires selecting an active subscription tier (Starter, Growth, or Agency).
            </p>
            <p>
              <strong>Billing Cycle:</strong> Paid plans are billed in advance on either a monthly or annual recurring cycle. All fees are non-refundable except where explicitly required by applicable consumer law.
            </p>
            <p>
              <strong>Cancellation:</strong> You may cancel your subscription at any time via your workspace settings. Cancellation takes effect at the end of the current paid billing cycle.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              5. Intellectual Property
            </h2>
            <p>
              NxtSend retains all right, title, and interest in and to the platform, including all algorithms, user interfaces, branding, software code, and documentation. You retain full ownership of all customer data, imported lead spreadsheets, custom campaign copy, and communication histories uploaded to your workspace.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              6. Limitation of Liability
            </h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NXTSEND AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, GOODWILL, WORK STOPPAGE, OR ACCOUNT ACTIONS TAKEN BY THIRD-PARTY PLATFORMS.
            </p>
            <p>
              IN NO EVENT SHALL OUR TOTAL AGGREGATE LIABILITY EXCEED THE TOTAL AMOUNT PAID BY YOU TO NXTSEND IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              7. Termination & Suspension
            </h2>
            <p>
              We reserve the right to suspend or terminate your account immediately without prior notice if we determine, in our sole discretion, that your account is involved in severe spam violations, illegal phishing activities, or material breaches of these Terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              8. Governing Law & Dispute Resolution
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of Texas, United States, without regard to conflict of law principles. Any legal disputes arising under this agreement shall be settled through binding arbitration in Travis County, Austin, Texas.
            </p>
          </section>

          <section className="space-y-4 border-t border-black-700/80 pt-8">
            <h2 className="text-22 font-bold text-white tracking-tight">
              9. Contact Information
            </h2>
            <p>
              Questions about these Terms of Service should be directed to our legal department:
            </p>
            <div className="rounded-2xl border border-black-700 bg-black-800/60 p-6 flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-14 font-semibold text-white">NxtSend Legal Counsel</p>
                <p className="text-13 text-black-400">Austin, TX 73301, USA</p>
                <a href="mailto:legal@nxtsend.com" className="text-14 text-purple-400 hover:underline">
                  legal@nxtsend.com
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
