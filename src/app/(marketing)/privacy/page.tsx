import type { Metadata } from "next";
import Link from "next/link";
import { Shield, AlertTriangle, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how NxtSend collects, protects, and manages customer and prospect information under GDPR and CCPA standards.",
};

export default function PrivacyPage() {
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
                This is a draft template provided for demonstrative and structural purposes. Have a qualified legal professional review and adapt this document to your specific regulatory jurisdiction and operational practices before official publication.
              </p>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="border-b border-black-700/80 pb-8 mb-10">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-900/30 px-3.5 py-1 text-12 font-semibold text-purple-300 mb-4">
            <Shield className="h-3.5 w-3.5 text-purple-400" />
            <span>Data Protection & Privacy</span>
          </div>
          <h1 className="text-36 sm:text-48 font-extrabold tracking-tight text-white">
            Privacy Policy
          </h1>
          <p className="mt-3 text-14 text-black-400">
            Last updated: {lastUpdated} &bull; Effective immediately for all registered users and visitors.
          </p>
        </div>

        {/* Content Body */}
        <div className="prose prose-invert max-w-none space-y-10 text-15 leading-relaxed text-black-300">
          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              1. Introduction
            </h2>
            <p>
              NxtSend (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the NxtSend SaaS platform, reachable via nxtsend.com and associated subdomains. We are committed to protecting the privacy, confidentiality, and security of both our users and the business contacts our users interact with through automated outreach.
            </p>
            <p>
              This Privacy Policy explains how personal data is collected, processed, and safeguarded when you access our marketing website, create an account, connect social network accounts, or initiate communication workflows.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              2. Data Collection
            </h2>
            <p>We collect information in the following categories:</p>
            <div className="rounded-2xl border border-black-700 bg-black-800/50 p-6 space-y-3">
              <h3 className="text-16 font-semibold text-white">A. Information You Provide Directly</h3>
              <ul className="list-disc list-inside space-y-1.5 text-14 text-black-300">
                <li>Account credentials: Name, email address, password, company name.</li>
                <li>Billing information: Processed securely via our payment gateway (Stripe). We do not store raw credit card numbers.</li>
                <li>Prospect files & CSV imports: Prospect names, job titles, business email addresses, and LinkedIn profile URLs imported into campaigns.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-black-700 bg-black-800/50 p-6 space-y-3">
              <h3 className="text-16 font-semibold text-white">B. Data Collected Automatically</h3>
              <ul className="list-disc list-inside space-y-1.5 text-14 text-black-300">
                <li>Log files and device identifiers: IP address, browser type, device specifications, referring URL, and session timestamps.</li>
                <li>Performance metrics: Delivery timestamps, message open indicators, click counts, and response latency.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              3. Use of Data
            </h2>
            <p>NxtSend uses the collected information strictly for legitimate commercial purposes:</p>
            <ul className="list-disc list-inside space-y-2 text-14 text-black-300">
              <li>To provide, operate, and maintain our multi-account automation and unified inbox services.</li>
              <li>To execute AI-powered sentiment analysis and personalized message variable generation.</li>
              <li>To detect and prevent fraudulent account creation, unauthorized scraping, and abuse of API limits.</li>
              <li>To communicate critical account notices, invoices, system status updates, and security disclosures.</li>
              <li>To comply with binding legal obligations, regulatory disclosures, and law enforcement requests.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              4. Data Sharing & Third-Party Processors
            </h2>
            <p>
              We do not sell, rent, or trade your personal information or your imported prospect databases to third-party data brokers or advertisers. Data is shared exclusively with verified infrastructure sub-processors under strict data protection agreements:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-14 text-black-300">
              <li><strong>Cloud Infrastructure:</strong> AWS and Supabase for redundant, encrypted database storage.</li>
              <li><strong>Payment Processing:</strong> Stripe for PCI-DSS compliant subscription billing.</li>
              <li><strong>AI Capabilities:</strong> OpenAI API for dynamic sentiment classification (data is not used for model training).</li>
              <li><strong>Email Dispatch:</strong> Resend and Amazon SES for transactional notification delivery.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              5. Cookies and Tracking Technologies
            </h2>
            <p>
              We use session cookies and authentication tokens to keep you signed in securely and remember workspace preferences. You can configure your browser to block cookies, although certain parts of our application may not function correctly. For detailed information, review our{" "}
              <Link href="/cookies" className="text-purple-400 hover:underline">
                Cookie Policy
              </Link>
              .
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              6. Your Data Rights (GDPR & CCPA)
            </h2>
            <p>
              Depending on your location, you hold statutory rights under data protection regulations:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-black-700 bg-black-800/40 p-4">
                <h4 className="text-14 font-semibold text-white">Right to Access & Portability</h4>
                <p className="mt-1 text-12 text-black-400">Request an export of all personal data held in your account.</p>
              </div>
              <div className="rounded-xl border border-black-700 bg-black-800/40 p-4">
                <h4 className="text-14 font-semibold text-white">Right to Erasure (To Be Forgotten)</h4>
                <p className="mt-1 text-12 text-black-400">Request permanent deletion of your profile and campaign history.</p>
              </div>
              <div className="rounded-xl border border-black-700 bg-black-800/40 p-4">
                <h4 className="text-14 font-semibold text-white">Right to Rectification</h4>
                <p className="mt-1 text-12 text-black-400">Correct inaccurate or incomplete account and company records.</p>
              </div>
              <div className="rounded-xl border border-black-700 bg-black-800/40 p-4">
                <h4 className="text-14 font-semibold text-white">Right to Object</h4>
                <p className="mt-1 text-12 text-black-400">Opt out of automated processing or marketing communications.</p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              7. Security & Retention
            </h2>
            <p>
              We maintain SOC-2 standard controls, including TLS 1.3 in transit and AES-256 encryption at rest. Customer data is retained as long as your workspace account is active, and is permanently purged 30 days following verified account cancellation.
            </p>
          </section>

          <section className="space-y-4 border-t border-black-700/80 pt-8">
            <h2 className="text-22 font-bold text-white tracking-tight">
              8. Contact Our Data Protection Officer
            </h2>
            <p>
              If you have inquiries, complaints, or wish to exercise your statutory privacy rights, contact our Data Protection Officer at:
            </p>
            <div className="rounded-2xl border border-black-700 bg-black-800/60 p-6 flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-14 font-semibold text-white">NxtSend Privacy & Compliance Team</p>
                <p className="text-13 text-black-400">Austin, TX 73301, USA</p>
                <a href="mailto:privacy@nxtsend.com" className="text-14 text-purple-400 hover:underline">
                  privacy@nxtsend.com
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
