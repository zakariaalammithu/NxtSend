import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us — Get in Touch with NxtSend",
  description:
    "Have questions about NxtSend? Reach out to our team at hello@nxtsend.com or submit a message. We're here to help.",
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
