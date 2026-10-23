import * as React from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-black-900 text-white flex flex-col lg:flex-row">
      {/* Left 40% Desktop Gradient Panel */}
      <div className="hidden lg:flex lg:w-[40%] flex-col justify-between p-10 xl:p-14 relative overflow-hidden bg-black-800/80 border-r border-black-700/60">
        {/* Animated Background Gradients */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl animate-pulse-slow" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-orange-600/15 blur-3xl animate-pulse-slow" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/15 via-black-900/0 to-black-900/60" />

        {/* Brand Logo at top */}
        <div className="relative z-10">
          <Link href="/" className="inline-flex group">
            <Logo
              size={40}
              wordmarkGradient
              className="transition-transform group-hover:scale-105"
              wordmarkClassName="text-22 font-extrabold font-sans"
            />
          </Link>
        </div>

        {/* Center Tagline and Benefits */}
        <div className="relative z-10 my-auto py-12 max-w-md">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-600/10 px-3.5 py-1 text-12 font-medium text-purple-300 mb-6">
            <Sparkles className="h-3.5 w-3.5 text-orange-400" />
            <span>Next-Gen Outbound Automation</span>
          </div>

          <h1 className="text-32 xl:text-38 font-bold leading-tight tracking-tight text-white">
            The outreach platform that works{" "}
            <span className="text-gradient-brand">while you sleep.</span>
          </h1>

          <p className="mt-4 text-15 text-black-300 leading-relaxed">
            Automate high-converting B2B multichannel touchpoints across LinkedIn
            and email without risking domain reputation or account safety.
          </p>

          <div className="mt-8 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-purple-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <p className="text-14 text-black-200">
                <strong>Multichannel Orchestration:</strong> Synchronize LinkedIn
                connection requests, smart delays, and verified cold emails in one flow.
              </p>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-orange-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <p className="text-14 text-black-200">
                <strong>Smart Human Delays:</strong> Randomized sending patterns
                help protect your LinkedIn profile and sender domain.
              </p>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-purple-400">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <p className="text-14 text-black-200">
                <strong>Unified Inbox:</strong> Manage all prospect responses in
                a centralized stream with instant sentiment tagging.
              </p>
            </div>
          </div>
        </div>

        {/* Footer brand statement */}
        <div className="relative z-10 border-t border-black-700/60 pt-6">
          <p className="text-13 text-black-400 italic">
            &ldquo;Plan campaigns, personalize every message, and work every reply from one inbox.&rdquo;
          </p>
          <div className="mt-2 flex items-center gap-2 text-12 font-medium text-black-300">
            <span>NxtSend</span>
            <span className="text-black-600">•</span>
            <span>LinkedIn &amp; email outreach, in one workspace</span>
          </div>
        </div>
      </div>

      {/* Right 60% Form Container (Full width on mobile) */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 py-8 sm:px-8 sm:py-12 relative overflow-y-auto">
        {/* Mobile Header Logo */}
        <div className="lg:hidden mb-8 text-center">
          <Link href="/" className="inline-flex group">
            <Logo
              size={36}
              wordmarkGradient
              wordmarkClassName="text-20 font-sans"
            />
          </Link>
        </div>

        {/* Centered Auth Card */}
        <div className="w-full max-w-[460px] bg-black-800 border border-black-600/70 rounded-2xl sm:rounded-3xl p-6 sm:p-9 shadow-2xl backdrop-blur-xl relative">
          {children}
        </div>

        {/* Footer legal links */}
        <div className="mt-8 text-center text-12 text-black-400">
          <span>&copy; {new Date().getFullYear()} NxtSend Inc. All rights reserved.</span>
        </div>
      </div>
    </div>
  );
}
