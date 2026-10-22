"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Linkedin, Facebook } from "lucide-react";
interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/* Footer columns — every link points at a route that exists. */
export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Integrations", href: "/integrations" },
      { label: "Avatars", href: "/avatars" },
      { label: "Agency", href: "/agency" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Academy", href: "/academy" },
      { label: "Help & Support", href: "/support" },
      { label: "Developers", href: "/developers" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Company",
    links: [{ label: "Book a Demo", href: "/demo" }],
  },
];

/* Social profiles (P6): the owner supplied real company profiles, so the
   LinkedIn + Facebook icons are back — the same URLs the contact page
   uses. The old X/GitHub placeholders (x.com/nxtsend, github.com/nxtsend)
   returned 404 and stay removed. */
const SOCIAL_LINKS = [
  {
    label: "NxtSend on LinkedIn",
    href: "https://www.linkedin.com/company/NxtSend",
    Icon: Linkedin,
  },
  {
    label: "NxtSend on Facebook",
    href: "https://web.facebook.com/NxtSend",
    Icon: Facebook,
  },
];

export function Footer() {
  const [logoError, setLogoError] = useState<boolean>(false);

  return (
    <footer className="relative w-full bg-black-900 px-3 pb-3 pt-2 text-white sm:px-4 sm:pb-4">
      {/* Large dark navy rounded container */}
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

            <div className="mt-6 flex items-center gap-3">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-black-300 transition-colors hover:border-purple-500/50 hover:text-white"
                >
                  <Icon className="h-[18px] w-[18px]" />
                </a>
              ))}
            </div>
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
            <Link href="/cookies" className="transition-colors hover:text-white">
              Cookie Policy
            </Link>
          </div>
          <span>© 2025 NxtSend. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
