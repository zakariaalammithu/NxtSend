import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request a Demo — See NxtSend in Action",
  description:
    "Schedule a 1-on-1 personalized demonstration of NxtSend. Discover how to scale multichannel outreach, AI personalization, and unified inboxes.",
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
