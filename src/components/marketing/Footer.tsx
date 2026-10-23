"use client";

import React from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { BRAND_TAGLINE } from "@/lib/brand";
import { Linkedin, Facebook } from "lucide-react";
interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/* Footer columns (P10) — every link points at a route that exists, and
   every anchor at an id that exists on the target page. There is no
   public Features, Campaigns or About route, so those labels are not
   linked: campaign help lives under Resources as the /support#campaigns
   guide. Legal links live in Company & Legal; the bottom row stays
   slim (copyright + contact email only). */
export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Integrations", href: "/integrations" },
      { label: "Avatars", href: "/avatars" },
      { label: "Agency", href: "/agency" },
      { label: "Pricing", href: "/pricing" },
      { label: "Developers", href: "/developers" },
      { label: "Get Started", href: "/signup" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help & Support", href: "/support" },
      { label: "Academy", href: "/academy" },
      { label: "FAQ", href: "/support#faq" },
      { label: "Getting Started", href: "/support#getting-started" },
      { label: "Campaign Setup", href: "/support#campaigns" },
      { label: "Contact Us", href: "/contact" },
    ],
  },
  {
    title: "Company & Legal",
    links: [
      { label: "Book a Demo", href: "/demo" },
      { label: "Terms & Conditions", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Cookie Policy", href: "/cookies" },
    ],
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

const LINK_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500";

export function Footer() {
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
          <div className="lg:col-span-4">
            <Link
              href="/"
              className={`inline-flex rounded-lg transition-opacity hover:opacity-90 ${LINK_FOCUS}`}
              aria-label="NxtSend Home"
            >
              <Logo size={40} className="gap-3" wordmarkClassName="text-28" />
            </Link>

            <p className="mt-5 max-w-sm text-15 leading-relaxed text-black-400">
              NxtSend brings LinkedIn and email outreach into one workspace —
              campaigns, rented profiles and personalised messaging, with
              every reply in a single inbox.
            </p>

            <p className="mt-4 text-15 font-semibold text-white">
              {BRAND_TAGLINE}
            </p>

            <div className="mt-6 flex items-center gap-3">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-black-300 transition-colors hover:border-purple-500/50 hover:text-white ${LINK_FOCUS}`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-8">
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
                        className={`inline-block rounded text-15 text-black-400 transition-colors duration-200 hover:text-white ${LINK_FOCUS}`}
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

        {/* Bottom bar — slim: dynamic copyright + the public contact email.
            Legal links live in the Company & Legal column above. */}
        <div className="relative mt-14 flex flex-col gap-3 border-t border-white/5 pt-7 text-13 text-black-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} NxtSend. All rights reserved.
          </span>
          <a
            href="mailto:hello@nxtsend.com"
            className={`rounded transition-colors hover:text-white ${LINK_FOCUS}`}
          >
            hello@nxtsend.com
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
