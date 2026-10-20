"use client";

/**
 * SequenceBuilder — the shared sequence editing surface (P4 Stage 3):
 * canvas + step editor drawer + template entry/gallery, used by BOTH
 * the create wizard's Step 3 and the campaign detail page's Sequence
 * tab, so there is exactly one sequence editor in the product.
 *
 * It is a controlled component: hosts own the steps state and persist
 * through the campaigns repository (createCampaign /
 * replaceCampaignSteps) exactly as before. Condition branch
 * step-lists ride inside each condition step's `config` (see
 * src/lib/sequence.ts) and round-trip untouched.
 */

import * as React from "react";
import { Layers } from "lucide-react";
import { Modal } from "@/components/ui";
import type { TemplateVariables } from "@/lib/ai/prompt";
import {
  countSteps,
  duplicateStepAt,
  getStepAt,
  removeStepAt,
  updateStepAt,
  type PreviewContact,
  type SequenceStepDraft,
} from "@/lib/sequence";
import { SequenceCanvas } from "./SequenceCanvas";
import { StepEditorDrawer } from "./StepEditorDrawer";
import {
  SequenceEntryModal,
  TemplateGalleryModal,
} from "./TemplateGallery";

export interface SequenceBuilderProps {
  steps: SequenceStepDraft[];
  onStepsChange: (steps: SequenceStepDraft[]) => void;
  campaignName?: string;
  campaignDescription?: string;
  previewContacts?: PreviewContact[];
  customFieldNames?: string[];
  sender?: TemplateVariables;
  /** Show the "Create a sequence" entry modal when the sequence is
   *  empty (wizard). Hosts that manage their own empty state pass false. */
  showEntryModal?: boolean;
}

export function SequenceBuilder({
  steps,
  onStepsChange,
  campaignName = "",
  campaignDescription = "",
  previewContacts = [],
  customFieldNames = [],
  sender,
  showEntryModal = true,
}: SequenceBuilderProps) {
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = React.useState(false);
  const [entryDismissed, setEntryDismissed] = React.useState(false);
  const [pendingTemplate, setPendingTemplate] =
    React.useState<SequenceStepDraft[] | null>(null);

  const selectedStep = selectedPath ? getStepAt(steps, selectedPath) : null;

  // The entry modal greets an empty sequence once per mount.
  const entryOpen =
    showEntryModal && steps.length === 0 && !entryDismissed && !galleryOpen;

  const applyTemplate = (templateSteps: SequenceStepDraft[]) => {
    setGalleryOpen(false);
    if (steps.length > 0) {
      // Replacing a non-empty sequence asks first.
      setPendingTemplate(templateSteps);
      return;
    }
    onStepsChange(templateSteps);
    setEntryDismissed(true);
  };

  const confirmReplace = () => {
    if (pendingTemplate) onStepsChange(pendingTemplate);
    setPendingTemplate(null);
    setSelectedPath(null);
    setEntryDismissed(true);
  };

  const handleDrawerSave = (updated: SequenceStepDraft) => {
    if (!selectedPath) return;
    onStepsChange(updateStepAt(steps, selectedPath, updated));
    setSelectedPath(null);
  };

  const handleDrawerDelete = () => {
    if (!selectedPath) return;
    onStepsChange(removeStepAt(steps, selectedPath));
    setSelectedPath(null);
  };

  const handleDrawerDuplicate = () => {
    if (!selectedPath) return;
    const result = duplicateStepAt(steps, selectedPath);
    onStepsChange(result.steps);
    setSelectedPath(result.copyPath);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-18 font-bold text-white">Sequence</h2>
          <p className="text-13 text-black-300 mt-1">
            {steps.length === 0
              ? "No steps yet — start from a template or build your own flow."
              : `${countSteps(steps)} step${countSteps(steps) === 1 ? "" : "s"} including branches. Click a step to edit it; use + to insert between steps.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          data-testid="choose-template"
          className="inline-flex items-center gap-2 rounded-xl border border-purple-500/40 bg-purple-600/15 px-4 py-2 text-13 font-medium text-purple-100 hover:bg-purple-600/30 transition-colors"
        >
          <Layers className="h-4 w-4" />
          Choose template
        </button>
      </div>

      <SequenceCanvas
        steps={steps}
        onStepsChange={onStepsChange}
        selectedPath={selectedPath}
        onSelectStep={(path) => setSelectedPath(path)}
      />

      {selectedStep && (
        <StepEditorDrawer
          step={selectedStep}
          onClose={() => setSelectedPath(null)}
          onSave={handleDrawerSave}
          onDelete={handleDrawerDelete}
          onDuplicate={handleDrawerDuplicate}
          previewContacts={previewContacts}
          customFieldNames={customFieldNames}
          sender={sender}
          campaignName={campaignName}
          campaignDescription={campaignDescription}
        />
      )}

      <SequenceEntryModal
        open={entryOpen}
        onClose={() => setEntryDismissed(true)}
        onUseTemplate={() => setGalleryOpen(true)}
        onCreateFromScratch={() => setEntryDismissed(true)}
      />

      <TemplateGalleryModal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onUse={applyTemplate}
      />

      <Modal
        open={pendingTemplate !== null}
        onClose={() => setPendingTemplate(null)}
        title="Replace the current sequence?"
        description="The template will replace every step you have built so far, including branch steps. This cannot be undone."
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPendingTemplate(null)}
              className="rounded-xl bg-black-800 px-4 py-2 text-13 font-medium text-white border border-black-600 hover:bg-black-700"
            >
              Keep my sequence
            </button>
            <button
              type="button"
              onClick={confirmReplace}
              data-testid="confirm-replace-template"
              className="rounded-xl bg-purple-600 px-4 py-2 text-13 font-semibold text-white hover:bg-purple-500"
            >
              Replace sequence
            </button>
          </>
        }
      >
        <p className="text-13 text-black-300">
          You can still edit every step of the template after it is applied —
          only your current steps are discarded.
        </p>
      </Modal>
    </div>
  );
}

export default SequenceBuilder;
