import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Integrations — Connect Your Entire Stack",
  description:
    "Seamlessly integrate NxtSend with your favorite CRMs, email service providers, spreadsheets, and webhooks. HubSpot, Salesforce, Resend, Zapier, and more.",
};

export default function IntegrationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
