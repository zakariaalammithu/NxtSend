"use client";

import React, { useState } from "react";
import Link from "next/link";
import { TwitterXIcon, LinkedInIcon, GitHubIcon } from "./icons";

interface FooterLink {
  label: string;
  href: string;
  badge?: string;
  isExternal?: boolean;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "LinkedIn Automation", href: "/features/linkedin" },
      { label: "Email Outreach", href: "/features/email" },
      { label: "Unified Inbox", href: "/features/inbox" },
      { label: "Analytics", href: "/features/analytics" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Careers", href: "/careers" },
      { label: "Press", href: "/press" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Academy", href: "/academy" },
      { label: "Experts", href: "/experts" },
      { label: "AI Profiles", href: "/ai-profiles", badge: "Coming Soon" },
      { label: "Help Center", href: "/help" },
      { label: "API Docs", href: "/docs" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Cookie Policy", href: "/cookies" },
    ],
  },
];

const SOCIAL_LINKS = [
  {
    label: "Twitter / X",
    href: "https://x.com/nxtsend",
    icon: TwitterXIcon,
  },
  {
    label: "LinkedIn",
    href: "https://linkedin.com/company/nxtsend",
    icon: LinkedInIcon,
  },
  {
    label: "GitHub",
    href: "https://github.com/nxtsend",
    icon: GitHubIcon,
  },
];

export function Footer() {
  const [logoError, setLogoError] = useState<boolean>(false);

  return (
    <footer className="relative w-full bg-black-900 border-t border-black-700 text-white overflow-hidden">
      {/* Subtle top ambient glow line */}
      <div
        className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent pointer-events-none"
        aria-hidden="true"
      />

      {/* Subtle background radial gradient highlight */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-48 bg-gradient-to-b from-purple-900/10 to-transparent pointer-events-none blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 pt-16 pb-12">
        {/* Top Row: NxtSend logo + tagline */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-12 border-b border-black-800">
          <div className="space-y-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 transition-opacity hover:opacity-90"
              aria-label="NxtSend Home"
            >
              {!logoError ? (
                <img
                  src="/logo.png"
                  alt="NxtSend"
                  className="h-7 w-auto object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand text-white font-extrabold text-13 shadow-sm">
                    N
                  </span>
                  <span className="text-gradient-brand font-bold text-20 tracking-tight">
                    NxtSend
                  </span>
                </span>
              )}
            </Link>

            <p className="text-15 text-black-400 font-normal max-w-md">
              Scale your outreach. Automate your growth.
            </p>
          </div>

          {/* Social Icons Row */}
          <div className="flex items-center gap-3">
            {SOCIAL_LINKS.map((social) => {
              const Icon = social.icon;
              return (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-black-700 bg-black-800/40 text-black-400 transition-all duration-200 hover:border-purple-500/50 hover:bg-black-800 hover:text-white hover:shadow-glow-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                  aria-label={social.label}
                >
                  <Icon className="h-4 w-4" />
                </a>
              );
            })}
          </div>
        </div>

        {/* 4 Column Grid */}
        <div className="py-12 grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12 border-b border-black-800">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className="space-y-4">
              <h3 className="text-13 font-semibold uppercase tracking-wider text-white">
                {column.title}
              </h3>
              <ul className="space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="group inline-flex items-center text-14 text-black-400 hover:text-white transition-colors duration-200"
                    >
                      <span className="group-hover:translate-x-0.5 transition-transform duration-150">
                        {link.label}
                      </span>
                      {link.badge && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-purple-600/20 text-purple-400 border border-purple-600/30">
                          {link.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar: Copyright | Address | Email */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-13 sm:text-14 text-black-400">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-y-2 gap-x-3 text-center md:text-left">
            <span>© 2025 NxtSend. All rights reserved.</span>
            <span className="hidden sm:inline text-black-700 select-none" aria-hidden="true">
              |
            </span>
            <span>Austin, TX 73301, USA</span>
            <span className="hidden sm:inline text-black-700 select-none" aria-hidden="true">
              |
            </span>
            <a
              href="mailto:hello@nxtsend.com"
              className="text-black-400 hover:text-white transition-colors underline-offset-4 hover:underline"
            >
              hello@nxtsend.com
            </a>
          </div>

          <p className="text-12 text-black-500 text-center md:text-right">
            Designed for high-performance outreach teams
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
