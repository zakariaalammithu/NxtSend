"use client";

import * as React from "react";
import { Linkedin, Mail, CreditCard, Puzzle, FileSpreadsheet, Webhook, AlertCircle } from "lucide-react";
import { DemoBanner, Badge, Modal } from "@/components/ui";

interface IntegrationItem {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  status: "connected" | "demo" | "coming_soon";
  lastSynced: string;
  buttonLabel: string;
}

export default function IntegrationsPage() {
  const [selectedIntegration, setSelectedIntegration] = React.useState<IntegrationItem | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);

  const integrations: IntegrationItem[] = [
    {
      id: "linkedin",
      name: "LinkedIn",
      icon: Linkedin,
      description:
        "Automate personalized connection requests, smart profile visits, and in-network direct messages.",
      status: "demo",
      lastSynced: "Demo: N/A",
      buttonLabel: "Connect LinkedIn Account",
    },
    {
      id: "resend",
      name: "Email / Resend",
      icon: Mail,
      description:
        "Send verified cold email sequences with high deliverability, SPF/DKIM verification, and open tracking.",
      status: "demo",
      lastSynced: "Demo: N/A",
      buttonLabel: "Configure Email Provider",
    },
    {
      id: "stripe",
      name: "Stripe / Billing",
      icon: CreditCard,
      description:
        "Manage subscription tiers, payment methods, seats, and automated plan renewals through Stripe Customer Portal.",
      status: "demo",
      lastSynced: "Demo: N/A",
      buttonLabel: "Set Up Billing",
    },
    {
      id: "hubspot",
      name: "HubSpot CRM",
      icon: Puzzle,
      description:
        "Automatically sync newly converted leads, meeting bookings, and message transcripts into your CRM deals.",
      status: "coming_soon",
      lastSynced: "N/A",
      buttonLabel: "Coming Soon",
    },
    {
      id: "sheets",
      name: "Google Sheets",
      icon: FileSpreadsheet,
      description:
        "Export positive replies and lead phone numbers directly into Google Sheets in real-time.",
      status: "coming_soon",
      lastSynced: "N/A",
      buttonLabel: "Coming Soon",
    },
    {
      id: "webhooks",
      name: "Webhooks",
      icon: Webhook,
      description:
        "Trigger custom HTTP endpoints on key events: lead replied, campaign bounced, connection accepted.",
      status: "coming_soon",
      lastSynced: "N/A",
      buttonLabel: "Coming Soon",
    },
  ];

  const handleOpenConfigModal = (item: IntegrationItem) => {
    setSelectedIntegration(item);
    setModalOpen(true);
  };

  return (
    <div className="space-y-7 pb-14">
      <DemoBanner feature="External Integrations" />

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Connected Integrations
          </h1>
          <span className="demo-badge">Demo Mode</span>
        </div>
        <p className="mt-1 text-14 text-black-300">
          Connect your outreach channels, CRM sync, and payment provider.
        </p>
      </div>

      {/* Integration Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((item) => {
          const isComingSoon = item.status === "coming_soon";
          const Icon = item.icon;

          return (
            <div
              key={item.id}
              className={`glass-card p-6 flex flex-col justify-between transition-all ${
                isComingSoon ? "opacity-75" : "hover:border-purple-500/50"
              }`}
            >
              <div>
                {/* Top: Icon + Status */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black-800 border border-black-700 text-purple-400">
                    <Icon className="h-5 w-5" />
                  </div>

                  {isComingSoon ? (
                    <Badge variant="gray">Coming Soon</Badge>
                  ) : (
                    <span className="demo-badge">Demo Mode</span>
                  )}
                </div>

                {/* Name & Description */}
                <h3 className="text-16 font-bold text-white mb-1.5">
                  {item.name}
                </h3>
                <p className="text-13 text-black-300 leading-relaxed mb-4">
                  {item.description}
                </p>
              </div>

              {/* Bottom: Last synced & Connect button */}
              <div className="pt-4 border-t border-black-700/60 space-y-3">
                <div className="flex items-center justify-between text-11 text-black-400">
                  <span>Last synced:</span>
                  <span className="font-medium text-black-300">{item.lastSynced}</span>
                </div>

                {isComingSoon ? (
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-xl bg-black-800 border border-black-700/60 py-2.5 px-4 text-13 font-medium text-black-500 cursor-not-allowed text-center"
                  >
                    Coming Soon
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenConfigModal(item)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600 border border-purple-500/30 hover:border-purple-500 text-purple-300 hover:text-white py-2.5 px-4 text-13 font-semibold transition-all duration-200"
                  >
                    <span>{item.buttonLabel}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Configuration Required Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Configuration Required"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-orange-500/30 bg-orange-950/20 p-4 text-orange-300">
            <AlertCircle className="h-5 w-5 shrink-0 text-orange-400 mt-0.5" />
            <div className="space-y-1 text-13">
              <p className="font-semibold text-white">
                Credentials Needed for {selectedIntegration?.name}
              </p>
              <p className="leading-relaxed">
                This integration requires API keys or session cookies configured in your environment variables.
              </p>
            </div>
          </div>

          <p className="text-13 text-black-300 leading-relaxed">
            See <strong className="text-white font-mono">SETUP.md</strong> in the repository root for step-by-step instructions on configuring production credentials for{" "}
            <strong className="text-purple-300">{selectedIntegration?.name}</strong>.
          </p>

          <div className="flex justify-end pt-3 border-t border-black-700">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2 text-13 font-semibold text-white transition-colors"
            >
              Understood
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
