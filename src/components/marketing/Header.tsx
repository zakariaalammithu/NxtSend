"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  MenuIcon,
  XIcon,
  ChevronDownIcon,
  LinkedInIcon,
  EmailIcon,
  InboxIcon,
  AnalyticsIcon,
} from "./icons";

export interface NavChildItem {
  label: string;
  href: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavItem {
  label: string;
  href?: string;
  children?: NavChildItem[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Product",
    children: [
      {
        label: "LinkedIn Automation",
        href: "/",
        description: "Automated connection requests and message sequences",
        icon: LinkedInIcon,
      },
      {
        label: "Email Outreach",
        href: "/integrations",
        description: "Personalized email campaigns with follow-ups",
        icon: EmailIcon,
      },
      {
        label: "Unified Inbox",
        href: "/demo",
        description: "All conversations in one place",
        icon: InboxIcon,
      },
      {
        label: "Analytics",
        href: "/",
        description: "Track performance and optimize campaigns",
        icon: AnalyticsIcon,
      },
    ],
  },
  { label: "Integrations", href: "/integrations" },
  { label: "Experts", href: "/experts" },
  { label: "Academy", href: "/academy" },
  { label: "Pricing", href: "/pricing" },
  { label: "Agency", href: "/agency" },
];

export function Header() {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [mobileProductExpanded, setMobileProductExpanded] = useState<boolean>(true);
  const [productDropdownOpen, setProductDropdownOpen] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<boolean>(false);

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect scroll past 100px
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setProductDropdownOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Handle escape key to close dropdown / mobile menu
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProductDropdownOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Dropdown hover timing
  const handleDropdownEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    setProductDropdownOpen(true);
  };

  const handleDropdownLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setProductDropdownOpen(false);
    }, 150);
  };

  const isProductActive = pathname?.startsWith("/features");

  return (
    <>
      {/* Header Container */}
      <header
        className={cn(
          "inset-x-0 z-40 transition-all duration-300 ease-out",
          isScrolled
            ? "fixed top-3 sm:top-4 px-3 sm:px-6 pointer-events-none"
            : "absolute top-0 px-4 sm:px-8 py-5 sm:py-6 bg-transparent"
        )}
      >
        <div
          className={cn(
            "mx-auto flex items-center justify-between transition-all duration-300",
            isScrolled
              ? "pointer-events-auto max-w-6xl rounded-full bg-black-900/90 backdrop-blur-md border border-black-700 shadow-[0_12px_40px_rgba(0,0,0,0.6)] px-5 sm:px-6 py-2.5"
              : "max-w-7xl"
          )}
        >
          {/* Logo: /logo.png with fallback to gradient text */}
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 transition-opacity hover:opacity-90"
            aria-label="NxtSend Home"
          >
            {!logoError ? (
              <span className="flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt="NxtSend"
                  className="h-7 w-auto object-contain"
                  onError={() => setLogoError(true)}
                />
                <span className="font-bold text-20 tracking-tight text-white">
                  NxtSend
                </span>
              </span>
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

          {/* Desktop Navigation (lg+ breakpoint) */}
          <nav
            className="hidden lg:flex items-center gap-1 xl:gap-2"
            aria-label="Main Navigation"
          >
            {NAV_ITEMS.map((item) => {
              if (item.children) {
                return (
                  <div
                    key={item.label}
                    ref={dropdownRef}
                    className="relative"
                    onMouseEnter={handleDropdownEnter}
                    onMouseLeave={handleDropdownLeave}
                  >
                    <button
                      type="button"
                      onClick={() => setProductDropdownOpen((prev) => !prev)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-14 font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                        isProductActive || productDropdownOpen
                          ? "text-white font-semibold"
                          : "text-black-400 hover:text-white"
                      )}
                      aria-expanded={productDropdownOpen}
                      aria-haspopup="true"
                    >
                      <span>{item.label}</span>
                      <ChevronDownIcon
                        className={cn(
                          "w-3.5 h-3.5 transition-transform duration-200",
                          productDropdownOpen
                            ? "rotate-180 text-white"
                            : "text-black-400"
                        )}
                      />
                    </button>

                    {/* Product Dropdown Flyout */}
                    {productDropdownOpen && (
                      <div
                        className="absolute top-full left-1/2 -translate-x-1/2 pt-3 z-50 w-[380px]"
                        onMouseEnter={handleDropdownEnter}
                        onMouseLeave={handleDropdownLeave}
                      >
                        <div className="rounded-2xl bg-black-900/95 backdrop-blur-xl border border-black-700 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-slide-down">
                          <div className="space-y-1">
                            {item.children.map((child) => {
                              const active = pathname === child.href;
                              const IconComponent = child.icon;

                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  onClick={() => setProductDropdownOpen(false)}
                                  className={cn(
                                    "flex items-start gap-3 p-3 rounded-xl transition-all duration-200 group/child",
                                    active
                                      ? "bg-purple-600/15 border border-purple-600/30 text-white"
                                      : "hover:bg-black-800/80 border border-transparent hover:border-black-700"
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
                                      active
                                        ? "bg-purple-600 text-white shadow-glow-purple"
                                        : "bg-black-800 border border-black-700 text-purple-400 group-hover/child:bg-purple-600/20 group-hover/child:text-purple-300 group-hover/child:border-purple-600/40"
                                    )}
                                  >
                                    <IconComponent className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div
                                      className={cn(
                                        "text-14 font-semibold transition-colors duration-200",
                                        active
                                          ? "text-white"
                                          : "text-white group-hover/child:text-purple-300"
                                      )}
                                    >
                                      {child.label}
                                    </div>
                                    <p className="text-12 text-black-400 line-clamp-1 mt-0.5">
                                      {child.description}
                                    </p>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.label}
                  href={item.href!}
                  className={cn(
                    "px-3.5 py-2 rounded-full text-14 font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                    isActive
                      ? "text-white font-semibold"
                      : "text-black-400 hover:text-white"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right Side Actions (Desktop lg+) */}
          <div className="hidden lg:flex items-center gap-2">
            <Link
              href="/demo"
              className={cn(
                "text-14 font-medium transition-colors duration-200 px-3.5 py-1.5 rounded-full hover:bg-black-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                pathname === "/demo"
                  ? "text-white font-semibold"
                  : "text-black-400 hover:text-white"
              )}
            >
              Get Demo
            </Link>

            <span
              className="text-black-700 select-none text-14 px-1"
              aria-hidden="true"
            >
              |
            </span>

            <Link
              href="/login"
              className={cn(
                "text-14 font-medium transition-colors duration-200 px-3.5 py-1.5 rounded-full hover:bg-black-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
                pathname === "/login"
                  ? "text-white font-semibold"
                  : "text-black-400 hover:text-white"
              )}
            >
              Log In
            </Link>

            <Link
              href="/signup"
              className="rounded-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-600 text-white font-semibold text-14 px-5 py-2 shadow-lg shadow-purple-900/30 hover:shadow-glow-purple transition-all duration-200 transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 active:translate-y-0"
            >
              Start for Free
            </Link>
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex items-center lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="p-2 rounded-xl text-black-400 hover:text-white hover:bg-black-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <XIcon className="w-6 h-6 text-white" />
              ) : (
                <MenuIcon className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Full-Screen Overlay Menu */}
      <div
        className={cn(
          "lg:hidden fixed inset-0 z-50 bg-black-900/98 backdrop-blur-2xl transition-all duration-300 ease-in-out overflow-hidden flex flex-col",
          mobileMenuOpen
            ? "h-screen opacity-100 pointer-events-auto"
            : "h-0 opacity-0 pointer-events-none"
        )}
        aria-hidden={!mobileMenuOpen}
      >
        {/* Top bar inside mobile overlay */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black-800 shrink-0">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 focus:outline-none"
            aria-label="NxtSend Home"
          >
            {!logoError ? (
              <span className="flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt="NxtSend"
                  className="h-7 w-auto object-contain"
                  onError={() => setLogoError(true)}
                />
                <span className="font-bold text-20 tracking-tight text-white">
                  NxtSend
                </span>
              </span>
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

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 rounded-xl text-black-400 hover:text-white hover:bg-black-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            aria-label="Close menu"
          >
            <XIcon className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Scrollable menu content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Navigation Links */}
          <div className="space-y-4">
            {/* Product Accordion Section */}
            <div className="rounded-2xl bg-black-800/40 border border-black-700/60 p-4">
              <button
                type="button"
                onClick={() => setMobileProductExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between text-15 font-semibold text-white transition-colors"
                aria-expanded={mobileProductExpanded}
              >
                <span className="flex items-center gap-2">
                  <span>Product</span>
                  {isProductActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                  )}
                </span>
                <ChevronDownIcon
                  className={cn(
                    "w-4 h-4 text-black-400 transition-transform duration-200",
                    mobileProductExpanded ? "rotate-180" : ""
                  )}
                />
              </button>

              {mobileProductExpanded && (
                <div className="mt-3 pt-3 border-t border-black-700/60 space-y-2">
                  {NAV_ITEMS[0]?.children?.map((child) => {
                    const active = pathname === child.href;
                    const IconComponent = child.icon;

                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-start gap-3 p-2.5 rounded-xl transition-all duration-200",
                          active
                            ? "bg-purple-600/20 border border-purple-600/40 text-white"
                            : "hover:bg-black-800 text-black-300 hover:text-white"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5",
                            active
                              ? "bg-purple-600 text-white"
                              : "bg-black-800 text-purple-400 border border-black-700"
                          )}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-14 font-semibold text-white">
                            {child.label}
                          </div>
                          <p className="text-12 text-black-400 line-clamp-1 mt-0.5">
                            {child.description}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Standard Nav Links */}
            <div className="space-y-1">
              {NAV_ITEMS.slice(1).map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.label}
                    href={item.href!}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center justify-between px-4 py-3 rounded-xl text-15 font-medium transition-all duration-200",
                      active
                        ? "bg-purple-600/15 border border-purple-600/30 text-white font-semibold"
                        : "text-black-400 hover:text-white hover:bg-black-800/60"
                    )}
                  >
                    <span>{item.label}</span>
                    {active && (
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                    )}
                  </Link>
                );
              })}

              <Link
                href="/demo"
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center justify-between px-4 py-3 rounded-xl text-15 font-medium transition-all duration-200",
                  pathname === "/demo"
                    ? "bg-purple-600/15 border border-purple-600/30 text-white font-semibold"
                    : "text-black-400 hover:text-white hover:bg-black-800/60"
                )}
              >
                <span>Get Demo</span>
                {pathname === "/demo" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                )}
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom CTA Actions */}
        <div className="shrink-0 p-6 border-t border-black-800 bg-black-900/90 space-y-3">
          <Link
            href="/login"
            onClick={() => setMobileMenuOpen(false)}
            className="w-full flex items-center justify-center py-3 px-4 rounded-full border border-black-700 bg-black-800/60 text-14 font-semibold text-white hover:bg-black-800 transition-colors"
          >
            Log In
          </Link>

          <Link
            href="/signup"
            onClick={() => setMobileMenuOpen(false)}
            className="w-full flex items-center justify-center py-3 px-4 rounded-full bg-gradient-to-r from-purple-600 to-purple-500 text-14 font-semibold text-white shadow-lg shadow-purple-900/30 hover:shadow-glow-purple transition-all"
          >
            Start for Free
          </Link>
        </div>
      </div>
    </>
  );
}

export default Header;
