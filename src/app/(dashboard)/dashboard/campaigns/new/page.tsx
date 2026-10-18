"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Linkedin,
  Mail,
  Zap,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Clock,
  Send,
  MessageSquare,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { DemoBanner } from "@/components/ui";
import type { CampaignType, StepType } from "@/types";

interface SequenceStepDraft {
  id: string;
  step_type: StepType;
  delay_hours: number;
  subject: string;
  content: string;
}

export default function NewCampaignWizardPage() {
  const router = useRouter();

  // Wizard Step (1, 2, 3)
  const [currentStep, setCurrentStep] = React.useState<number>(1);

  // Step 1: Type
  const [campaignType, setCampaignType] = React.useState<CampaignType>("mixed");

  // Step 2: Name & Description
  const [campaignName, setCampaignName] = React.useState("");
  const [campaignDescription, setCampaignDescription] = React.useState("");

  // Step 3: Sequence Steps
  const [steps, setSteps] = React.useState<SequenceStepDraft[]>([
    {
      id: "step-1",
      step_type: "connection_request",
      delay_hours: 0,
      subject: "LinkedIn Connection",
      content:
        "Hi {{first_name}}, saw your profile while researching B2B leaders at {{company}}. Would love to connect and follow your work!",
    },
    {
      id: "step-2",
      step_type: "wait",
      delay_hours: 24,
      subject: "Wait 24 Hours",
      content: "Wait for prospect to accept LinkedIn connection request.",
    },
    {
      id: "step-3",
      step_type: "linkedin_message",
      delay_hours: 2,
      subject: "Follow-up LinkedIn Note",
      content:
        "Thanks for connecting, {{first_name}}! We recently put together a playbook on automating multichannel pipeline touches without domain spam flags. Thought it could be helpful for {{company}}.",
    },
    {
      id: "step-4",
      step_type: "email",
      delay_hours: 48,
      subject: "Quick question regarding {{company}}'s outbound",
      content:
        "Hi {{first_name}},\n\nWanted to quickly follow up on my LinkedIn note. How is your team currently approaching multichannel outreach?\n\nBest,\nAlex",
    },
  ]);

  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Add step
  const handleAddStep = (type: StepType) => {
    const newStep: SequenceStepDraft = {
      id: `step-${Date.now()}`,
      step_type: type,
      delay_hours: type === "wait" ? 24 : 0,
      subject:
        type === "connection_request"
          ? "LinkedIn Connection"
          : type === "linkedin_message"
          ? "LinkedIn Message"
          : type === "email"
          ? "Cold Email"
          : "Wait Delay",
      content:
        type === "wait"
          ? "Wait period before triggering the next action"
          : "Hi {{first_name}}, ...",
    };
    setSteps([...steps, newStep]);
  };

  // Move step up / down
  const handleMoveStep = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === steps.length - 1)
    ) {
      return;
    }
    const newSteps = [...steps];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIndex];
    newSteps[targetIndex] = temp;
    setSteps(newSteps);
  };

  // Delete step
  const handleDeleteStep = (id: string) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((s) => s.id !== id));
  };

  // Update step field
  const handleUpdateStep = (
    id: string,
    field: keyof SequenceStepDraft,
    value: SequenceStepDraft[keyof SequenceStepDraft]
  ) => {
    setSteps(
      steps.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  // Final Submit
  const handleCreateCampaign = async () => {
    setIsSubmitting(true);
    // Simulate campaign creation
    setTimeout(() => {
      setIsSubmitting(false);
      router.push("/dashboard/campaigns");
    }, 700);
  };

  const getStepIcon = (type: StepType) => {
    switch (type) {
      case "connection_request":
        return <Linkedin className="h-4 w-4 text-blue-400" />;
      case "linkedin_message":
        return <MessageSquare className="h-4 w-4 text-sky-400" />;
      case "email":
        return <Mail className="h-4 w-4 text-purple-400" />;
      case "wait":
        return <Clock className="h-4 w-4 text-orange-400" />;
      default:
        return <Send className="h-4 w-4 text-purple-400" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-7 pb-16">
      <DemoBanner feature="Sequence Engine" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
              Create Campaign
            </h1>
            <span className="demo-badge">Step {currentStep} of 3</span>
          </div>
          <p className="mt-1 text-14 text-black-300">
            Build a targeted multichannel outreach sequence with smart delays.
          </p>
        </div>

        <Link
          href="/dashboard/campaigns"
          className="text-13 text-black-400 hover:text-white"
        >
          Cancel
        </Link>
      </div>

      {/* Wizard Progress Indicator */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          {[
            { num: 1, title: "Campaign Type" },
            { num: 2, title: "Details" },
            { num: 3, title: "Sequence Builder" },
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-13 font-bold transition-colors ${
                  currentStep === s.num
                    ? "bg-purple-600 text-white shadow-glow-purple"
                    : currentStep > s.num
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-black-700 text-black-400"
                }`}
              >
                {currentStep > s.num ? (
                  <CheckCircle2 className="h-4.5 w-4.5" />
                ) : (
                  s.num
                )}
              </div>
              <span
                className={`text-13 font-medium hidden sm:inline ${
                  currentStep === s.num ? "text-white" : "text-black-400"
                }`}
              >
                {s.title}
              </span>
              {idx < 2 && (
                <div className="w-12 sm:w-20 h-0.5 bg-black-700 mx-1 sm:mx-2" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: Campaign Type */}
      {currentStep === 1 && (
        <div className="glass-card p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-18 font-bold text-white">
              Choose your outreach channel strategy
            </h2>
            <p className="text-13 text-black-300 mt-1">
              Select how NxtSend should interact with prospects.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4.5">
            {/* Mixed Multi-Channel */}
            <div
              onClick={() => setCampaignType("mixed")}
              className={`cursor-pointer rounded-2xl border p-5 transition-all ${
                campaignType === "mixed"
                  ? "border-purple-500 bg-purple-600/15 shadow-glow-purple"
                  : "border-black-700 bg-black-800/60 hover:border-black-600"
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-orange-500 text-white mb-4">
                <Zap className="h-5 w-5" />
              </div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-15 font-bold text-white">Mixed Sequence</h3>
                <span className="demo-badge text-10 py-0 px-1.5">Recommended</span>
              </div>
              <p className="text-12 text-black-300 leading-relaxed">
                Connect on LinkedIn and follow up via verified cold email if unaccepted. Highest conversion rate.
              </p>
            </div>

            {/* LinkedIn Only */}
            <div
              onClick={() => setCampaignType("linkedin")}
              className={`cursor-pointer rounded-2xl border p-5 transition-all ${
                campaignType === "linkedin"
                  ? "border-purple-500 bg-purple-600/15 shadow-glow-purple"
                  : "border-black-700 bg-black-800/60 hover:border-black-600"
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 mb-4 border border-blue-500/30">
                <Linkedin className="h-5 w-5" />
              </div>
              <h3 className="text-15 font-bold text-white mb-1">LinkedIn Only</h3>
              <p className="text-12 text-black-300 leading-relaxed">
                Automate profile visits, connection requests, and in-network direct messages.
              </p>
            </div>

            {/* Email Only */}
            <div
              onClick={() => setCampaignType("email")}
              className={`cursor-pointer rounded-2xl border p-5 transition-all ${
                campaignType === "email"
                  ? "border-purple-500 bg-purple-600/15 shadow-glow-purple"
                  : "border-black-700 bg-black-800/60 hover:border-black-600"
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 mb-4 border border-purple-500/30">
                <Mail className="h-5 w-5" />
              </div>
              <h3 className="text-15 font-bold text-white mb-1">Email Only</h3>
              <p className="text-12 text-black-300 leading-relaxed">
                Classic cold email sequence with deliverability throttling and reply detection.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-black-700">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-6 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all"
            >
              <span>Continue to Details</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Name + Description */}
      {currentStep === 2 && (
        <div className="glass-card p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-18 font-bold text-white">Campaign Details</h2>
            <p className="text-13 text-black-300 mt-1">
              Give your campaign a memorable name and describe its objective.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-13 font-medium text-black-200 mb-1.5">
                Campaign Name *
              </label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Q4 B2B SaaS Founders Outreach"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-13 font-medium text-black-200 mb-1.5">
                Description (Optional)
              </label>
              <textarea
                value={campaignDescription}
                onChange={(e) => setCampaignDescription(e.target.value)}
                rows={3}
                placeholder="Targeting Seed and Series A founders with personalized benchmark insights..."
                className="input-field resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-black-700">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="inline-flex items-center gap-2 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-5 py-2.5 text-13 font-medium text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>

            <button
              type="button"
              disabled={!campaignName.trim()}
              onClick={() => setCurrentStep(3)}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-6 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all disabled:opacity-40"
            >
              <span>Next: Sequence Steps</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Sequence Steps Builder */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <div className="glass-card p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-18 font-bold text-white">Sequence Steps</h2>
                <p className="text-13 text-black-300 mt-1">
                  Add steps, drag-reorder with up/down controls, and customize delays.
                </p>
              </div>

              {/* Add Step Dropdown / Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddStep("connection_request")}
                  className="rounded-lg bg-black-800 hover:bg-black-700 border border-black-600 px-2.5 py-1.5 text-12 text-blue-300 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  <span>LinkedIn Connect</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddStep("email")}
                  className="rounded-lg bg-black-800 hover:bg-black-700 border border-black-600 px-2.5 py-1.5 text-12 text-purple-300 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  <span>Email</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddStep("wait")}
                  className="rounded-lg bg-black-800 hover:bg-black-700 border border-black-600 px-2.5 py-1.5 text-12 text-orange-300 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  <span>Delay</span>
                </button>
              </div>
            </div>

            {/* Sequence Steps Cards */}
            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div
                  key={step.id}
                  className="rounded-2xl border border-black-700/80 bg-black-800/80 p-5 space-y-3.5 relative hover:border-purple-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-black-700 text-12 font-bold text-white">
                        {idx + 1}
                      </div>
                      <div className="flex items-center gap-2">
                        {getStepIcon(step.step_type)}
                        <span className="text-14 font-semibold text-white capitalize">
                          {step.step_type.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    {/* Up / Down Reorder and Delete controls */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveStep(idx, "up")}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-700 disabled:opacity-20"
                        title="Move Up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === steps.length - 1}
                        onClick={() => handleMoveStep(idx, "down")}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-700 disabled:opacity-20"
                        title="Move Down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteStep(step.id)}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-black-400 hover:text-rose-400 hover:bg-rose-950/20"
                        title="Delete Step"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Delay & Subject */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-11 text-black-400 mb-1">
                        Wait Delay (hours after prior step)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={step.delay_hours}
                        onChange={(e) =>
                          handleUpdateStep(
                            step.id,
                            "delay_hours",
                            Number(e.target.value) || 0
                          )
                        }
                        className="input-field py-2 text-13"
                      />
                    </div>
                    <div>
                      <label className="block text-11 text-black-400 mb-1">
                        Step Label / Subject
                      </label>
                      <input
                        type="text"
                        value={step.subject}
                        onChange={(e) =>
                          handleUpdateStep(step.id, "subject", e.target.value)
                        }
                        className="input-field py-2 text-13"
                      />
                    </div>
                  </div>

                  {/* Content template */}
                  {step.step_type !== "wait" && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-11 text-black-400">
                          Message Body (supports {"{{first_name}}"}, {"{{company}}"})
                        </label>
                      </div>
                      <textarea
                        rows={3}
                        value={step.content}
                        onChange={(e) =>
                          handleUpdateStep(step.id, "content", e.target.value)
                        }
                        className="input-field py-2 text-13 resize-none font-mono text-12 text-black-200"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-black-700">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-2 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-5 py-2.5 text-13 font-medium text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Details</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCreateCampaign}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-7 py-3 text-14 font-semibold text-white shadow-glow-purple transition-all"
              >
                {isSubmitting ? (
                  <span>Launching Campaign...</span>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Create & Launch Campaign</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
