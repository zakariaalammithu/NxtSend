import type { Metadata } from "next";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: {
    default: "NxtSend — Supercharge your LinkedIn pipeline. At scale.",
    template: "%s | NxtSend",
  },
  description:
    "Reach thousands of leads per day with NxtSend — AI-powered personalization, multi-account automation, and a unified inbox for sales teams and growth agencies.",
  keywords: [
    "LinkedIn automation",
    "cold email outreach",
    "sales pipeline",
    "lead generation software",
    "B2B prospecting",
    "unified inbox",
    "AI outreach",
    "multi-account LinkedIn",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://nxtsend.com",
    siteName: "NxtSend",
    title: "NxtSend — Supercharge your LinkedIn pipeline. At scale.",
    description:
      "Reach thousands of leads per day with NxtSend — AI-powered personalization, multi-account automation, and a unified inbox.",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "NxtSend dashboard — unified inbox",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NxtSend — LinkedIn & Multichannel Outreach Platform",
    description:
      "Supercharge your LinkedIn pipeline with AI personalization and multi-account automation.",
    images: ["/images/og-image.png"],
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-black-900 text-white selection:bg-purple-600/30">
        {children}
      </main>
      <Footer />
    </>
  );
}
