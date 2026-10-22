import type { Metadata } from "next";
import Link from "next/link";
import { Cookie, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Understand how NxtSend uses cookies, local storage, and tracking technologies to deliver a secure, optimized platform experience.",
};

export default function CookiesPage() {
  const lastUpdated = "22 October 2026";

  const cookieCategories = [
    {
      name: "Essential & Authentication Cookies",
      required: true,
      description:
        "Strictly necessary for the application to work. Our authentication provider (Supabase) sets session cookies that keep you signed in and protect your workspace session; without them, signing in is not possible.",
      examples: ["sb-<project-ref>-auth-token"],
    },
    {
      name: "Functional & Preference Storage",
      required: false,
      description:
        "Browser local storage that remembers choices you make on this device — most importantly your cookie-consent decision — so the site does not have to ask on every visit.",
      examples: ["nxtsend_cookie_consent (local storage)"],
    },
    {
      name: "Marketing (Meta Pixel) — only when configured",
      required: false,
      description:
        "If a Meta (Facebook) Pixel ID is configured for this website, Meta's pixel may load after consent is recorded and set its own cookie to measure advertising performance. When no Pixel ID is configured, no pixel loads and this category sets nothing. We do not sell cookie data to data brokers.",
      examples: ["_fbp (set by Meta, only when a Pixel is configured)"],
    },
  ];

  return (
    <div className="relative min-h-screen overflow-x-clip bg-black-900 pt-12 pb-24 text-white">
      {/* Background glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-[400px] w-[750px] -translate-x-1/2 rounded-full bg-purple-600/10 blur-[140px]" />

      <div className="section-container relative z-10 max-w-4xl">
        {/* Header */}
        <div className="border-b border-black-700/80 pb-8 mb-10">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-900/30 px-3.5 py-1 text-12 font-semibold text-purple-300 mb-4">
            <Cookie className="h-3.5 w-3.5 text-purple-400" />
            <span>Transparency & Tracking</span>
          </div>
          <h1 className="text-36 sm:text-48 font-extrabold tracking-tight text-white">
            Cookie Policy
          </h1>
          <p className="mt-3 text-14 text-black-400">
            Last updated: {lastUpdated} &bull; Learn how NxtSend uses cookies and tracking technologies.
          </p>
        </div>

        {/* Content Body */}
        <div className="prose prose-invert max-w-none space-y-10 text-15 leading-relaxed text-black-300">
          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              1. What Are Cookies?
            </h2>
            <p>
              Cookies are small text files placed on your computer or mobile device by websites that you visit. They are widely used to make websites work properly, ensure secure user authentication, improve browsing efficiency, and provide diagnostic performance reports to site owners.
            </p>
            <p>
              In addition to cookies, NxtSend may use related technologies such as local storage, session storage, and web pixels to store state across page navigation and campaign creation sessions.
            </p>
          </section>

          <section className="space-y-6">
            <h2 className="text-22 font-bold text-white tracking-tight">
              2. Categories of Cookies We Use
            </h2>
            <p>
              We categorize the cookies and browser storage used on our platform as follows:
            </p>

            <div className="space-y-4">
              {cookieCategories.map((cat) => (
                <div
                  key={cat.name}
                  className="rounded-2xl border border-black-700 bg-black-800/50 p-6 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-16 font-bold text-white">{cat.name}</h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-11 font-semibold ${
                        cat.required
                          ? "bg-purple-600/20 text-purple-300 border border-purple-500/30"
                          : "bg-black-700 text-black-300 border border-black-600"
                      }`}
                    >
                      {cat.required ? "Required" : "Optional"}
                    </span>
                  </div>
                  <p className="text-13 leading-relaxed text-black-400">
                    {cat.description}
                  </p>
                  <div className="pt-2 text-12 text-black-500">
                    <span className="font-semibold text-black-400">Sample identifiers: </span>
                    <span className="font-mono text-purple-400/80">
                      {cat.examples.join(", ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              3. Third-Party Service Providers
            </h2>
            <p>
              Some cookies and tags are placed by reputable third-party partners to support our cloud infrastructure:
            </p>
            <ul className="list-disc list-inside space-y-2 text-14 text-black-300">
              <li><strong>Supabase:</strong> User authentication and session validation.</li>
              <li><strong>Stripe:</strong> Fraud prevention and secure payment processing on Stripe&apos;s own checkout pages.</li>
              <li><strong>Meta:</strong> Advertising measurement, only when a Meta Pixel is configured for this website and consent has been recorded (see Section 2).</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              4. How to Manage and Disable Cookies
            </h2>
            <p>
              You have the right to decide whether to accept or reject non-essential cookies. You can manage your preferences through your browser settings:
            </p>
            <ul className="list-disc list-inside space-y-2 text-14 text-black-300">
              <li><strong>Chrome:</strong> Settings &gt; Privacy and Security &gt; Cookies and other site data.</li>
              <li><strong>Firefox:</strong> Options &gt; Privacy &amp; Security &gt; Enhanced Tracking Protection.</li>
              <li><strong>Safari:</strong> Preferences &gt; Privacy &gt; Manage Website Data.</li>
            </ul>
            <p className="text-13 text-black-400">
              Please note that disabling strictly necessary cookies will prevent you from signing in to your NxtSend workspace or accessing your outreach campaigns.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-22 font-bold text-white tracking-tight">
              5. Updates to This Cookie Policy
            </h2>
            <p>
              We may revise this Cookie Policy periodically to reflect technological adjustments, new feature rollouts, or statutory amendments. Any updates will be published on this page with an amended &quot;Last updated&quot; timestamp.
            </p>
          </section>

          <section className="space-y-4 border-t border-black-700/80 pt-8">
            <h2 className="text-22 font-bold text-white tracking-tight">
              6. Contact Us
            </h2>
            <p>
              If you have inquiries regarding our utilization of cookies or tracking mechanisms, please reach out to:
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
