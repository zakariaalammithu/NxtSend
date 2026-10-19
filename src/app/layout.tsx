import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import MetaPixel from "@/components/analytics/MetaPixel";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://nxtsend.com"),
  title: {
    default: "NxtSend — LinkedIn Automation & Email Outreach Platform",
    template: "%s | NxtSend",
  },
  description:
    "Scale your LinkedIn outreach and email campaigns with NxtSend — AI-powered personalization, multi-account automation, and a unified inbox for sales teams and growth agencies.",
  keywords: [
    "LinkedIn automation",
    "email outreach",
    "lead generation",
    "sales automation",
    "LinkedIn outreach tool",
    "B2B prospecting",
    "NxtSend",
  ],
  authors: [{ name: "NxtSend", url: "https://nxtsend.com" }],
  creator: "NxtSend",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://nxtsend.com",
    siteName: "NxtSend",
    title: "NxtSend — LinkedIn Automation & Email Outreach Platform",
    description:
      "Scale your LinkedIn outreach and email campaigns with NxtSend — AI-powered personalization, multi-account automation, and a unified inbox.",
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
    title: "NxtSend — LinkedIn Automation & Email Outreach",
    description: "Scale your LinkedIn outreach and email campaigns with NxtSend.",
    images: ["/images/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className={`${manrope.className} antialiased`}>
        {children}
        {/* Renders nothing unless NEXT_PUBLIC_META_PIXEL_ID is set AND
            the visitor granted marketing consent (see SETUP.md). */}
        <MetaPixel />
      </body>
    </html>
  );
}
