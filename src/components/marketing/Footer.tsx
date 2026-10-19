"use client";

import React, { useState } from "react";
import Link from "next/link";
interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/* Aimfox-style footer columns — every link points at a route that exists. */
const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Integrations", href: "/integrations" },
      { label: "Experts", href: "/experts" },
      { label: "Avatars", href: "/avatars" },
      { label: "Agency", href: "/agency" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Academy", href: "/academy" },
      { label: "Experts", href: "/experts" },
      { label: "Help Center", href: "/contact" },
      { label: "API Docs", href: "/contact" },
      { label: "Roadmap", href: "/contact" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Reviews", href: "/#testimonials" },
      { label: "Book a Demo", href: "/demo" },
      { label: "Affiliate Program", href: "/contact" },
      { label: "Partnership Guidelines", href: "/contact" },
    ],
  },
];

/* Social icons removed (Fix Batch 3): the X and GitHub profiles linked here
   (x.com/nxtsend, github.com/nxtsend) return 404 — no verified NxtSend social
   profiles exist yet. Re-add icons here once real profile URLs exist. */

export function Footer() {
  const [logoError, setLogoError] = useState<boolean>(false);

  return (
    <footer className="relative w-full bg-black-900 px-3 pb-3 pt-2 text-white sm:px-4 sm:pb-4">
      {/* Large dark navy rounded container (Aimfox-style) */}
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[2.5rem] border border-white/5 bg-black-800 px-6 py-14 sm:px-10 lg:px-14">
        {/* Subtle ambient glow */}
        <div
          className="pointer-events-none absolute -top-24 left-1/3 h-64 w-[560px] rounded-full bg-purple-600/10 blur-[110px]"
          aria-hidden="true"
        />

        <div className="relative grid gap-12 lg:grid-cols-12">
          {/* Brand block */}
          <div className="lg:col-span-5">
            <Link
              href="/"
              className="inline-flex items-center gap-3 rounded-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              aria-label="NxtSend Home"
            >
              {!logoError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/logo.png"
                  alt="NxtSend"
                  className="h-10 w-10 object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand text-17 font-extrabold text-white shadow-sm">
                  N
                </span>
              )}
              <span className="text-28 font-bold tracking-tight text-white">
                NxtSend
              </span>
            </Link>

            <p className="mt-5 max-w-xs text-15 leading-relaxed text-black-400">
              Scale your outreach. Automate your growth.
            </p>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="text-13 font-bold uppercase tracking-[0.14em] text-white">
                  {column.title}
                </h3>
                <ul className="mt-5 space-y-3.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-15 text-black-400 transition-colors duration-200 hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="relative mt-14 flex flex-col gap-3 border-t border-white/5 pt-7 text-13 text-black-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <Link href="/terms" className="transition-colors hover:text-white">
              Terms Of Service
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-white">
              Privacy Policy
            </Link>
          </div>
          <span>© 2025 NxtSend. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
