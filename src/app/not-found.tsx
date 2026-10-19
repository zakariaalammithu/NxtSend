import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LayoutDashboard, MessagesSquare } from "lucide-react";

export const metadata: Metadata = {
  title: "Page Not Found",
  description:
    "That page doesn't exist on NxtSend — head back home, open your dashboard, or talk to our team.",
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-clip bg-black-900 text-white">
      {/* Brand bar */}
      <header className="mx-auto flex w-full max-w-7xl items-center px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="NxtSend Home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NxtSend" className="h-9 w-9 object-contain" />
          <span className="text-20 font-extrabold tracking-tight text-white">
            Nxt<span className="text-gradient-brand">Send</span>
          </span>
        </Link>
      </header>

      {/* Body */}
      <main className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-6 pb-24 pt-8 text-center">
        {/* Ambient brand glows (same treatment as the auth panel) */}
        <div className="pointer-events-none absolute -top-16 left-1/2 h-80 w-80 -translate-x-[70%] rounded-full bg-purple-600/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 translate-x-1/3 rounded-full bg-orange-600/10 blur-3xl" />

        <p className="relative text-gradient-brand text-64 font-extrabold leading-none tracking-tight sm:text-72">
          404
        </p>
        <h1 className="relative mt-4 text-24 font-bold tracking-tight sm:text-30">
          This page took a wrong turn
        </h1>
        <p className="relative mt-4 max-w-md text-15 leading-relaxed text-black-300">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
          Your campaigns, inbox and leads are right where you left them — pick a
          way back below.
        </p>

        <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-6 py-3 text-14 font-semibold text-white shadow-glow-purple transition-colors hover:bg-purple-500"
          >
            Back to home
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-black-600 bg-black-800 px-6 py-3 text-14 font-semibold text-white transition-colors hover:border-purple-500/60 hover:bg-black-700"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            Open the dashboard
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full border border-black-600 bg-black-800 px-6 py-3 text-14 font-semibold text-white transition-colors hover:border-purple-500/60 hover:bg-black-700"
          >
            <MessagesSquare className="h-4 w-4" aria-hidden="true" />
            Talk to our team
          </Link>
        </div>
      </main>

      <footer className="relative mx-auto w-full max-w-7xl px-6 pb-8 text-center text-12 text-black-400">
        &copy; {new Date().getFullYear()} NxtSend Inc. All rights reserved.
      </footer>
    </div>
  );
}
