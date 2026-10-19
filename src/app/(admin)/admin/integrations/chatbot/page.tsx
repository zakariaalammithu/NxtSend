"use client";

import * as React from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminBits";

/**
 * Admin → Integrations → AI Chatbot. HONEST STATE: NxtSend has no
 * chatbot product — no chat widget, no support-bot surface, no
 * conversation engine. What exists is AI-assisted DRAFTING inside the
 * campaign wizard (human review mandatory, nothing auto-sent). This
 * page documents that boundary so "AI Chatbot" is never mistaken for
 * a shipped feature.
 */
export default function AdminChatbotPage() {
  return (
    <div className="space-y-6 pb-14 max-w-4xl">
      <AdminPageHeader
        title="AI Chatbot"
        description="No chatbot exists in NxtSend today. This page explains what does and does not exist, rather than presenting a settings screen for a product that was never built."
        badge="Not a product"
      />

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">What exists</h2>
        <ul className="list-disc pl-5 space-y-2 text-13 text-black-300">
          <li>
            <strong className="text-black-100">AI outreach drafting</strong> in
            the campaign wizard (Draft with AI): a provider generates a draft
            from campaign context; the user must review and edit it before it
            can be used, and it is never sent automatically.
          </li>
          <li>
            <strong className="text-black-100">Three provider adapters</strong>{" "}
            (OpenAI, Anthropic, Meta Model API) with honest configuration
            states — see AI Providers.
          </li>
          <li>
            <strong className="text-black-100">A real inbox reply service</strong>{" "}
            (Stage C) that sends through the configured email provider with
            honest outcomes — human-written today; AI assistance there would
            reuse the same drafting adapter when wired.
          </li>
        </ul>
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="text-16 font-bold text-white">What does not exist</h2>
        <ul className="list-disc pl-5 space-y-2 text-13 text-black-300">
          <li>No embeddable chat widget for customer websites.</li>
          <li>No autonomous support agent answering customers.</li>
          <li>No chatbot analytics, training, or knowledge-base tooling.</li>
        </ul>
        <p className="text-13 text-black-400">
          Building any of these is a product project of its own (widget,
          conversation store, escalation rules, provider billing). Until
          then, this entry stays in the sidebar so the roadmap gap is
          visible — labelled, never faked.
        </p>
        <Link
          href="/admin/integrations/ai"
          className="inline-block text-13 font-semibold text-purple-400 hover:text-purple-300"
        >
          Go to AI Providers →
        </Link>
      </div>
    </div>
  );
}
