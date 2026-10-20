"use client";

/**
 * TemplateGallery — the "Create a sequence" entry modal and the
 * template gallery with read-only canvas previews (P4 Stage 3).
 *
 * Template names/structures follow the Closely gallery; all message
 * copy is original NxtSend copy (src/lib/sequence-templates.ts).
 * Picking a template hands fresh draft steps to the builder — the
 * gallery itself never saves anything.
 */

import * as React from "react";
import { Eye, Layers, Mail, MousePointerClick, PenLine } from "lucide-react";
import { Modal } from "@/components/ui";
import {
  SEQUENCE_TEMPLATES,
  type SequenceTemplate,
} from "@/lib/sequence-templates";
import { countSteps, type SequenceStepDraft } from "@/lib/sequence";
import { SequenceCanvas } from "./SequenceCanvas";

// ── Entry modal ─────────────────────────────────────────────────────────────

export function SequenceEntryModal({
  open,
  onClose,
  onUseTemplate,
  onCreateFromScratch,
}: {
  open: boolean;
  onClose: () => void;
  onUseTemplate: () => void;
  onCreateFromScratch: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a sequence"
      description="Start from a proven structure or build your own flow step by step."
      size="md"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onUseTemplate}
          data-testid="entry-use-template"
          className="rounded-2xl border border-purple-500/40 bg-purple-600/10 p-5 text-left hover:bg-purple-600/20 transition-colors"
        >
          <Layers className="h-6 w-6 text-purple-300" />
          <span className="mt-3 block text-15 font-semibold text-white">
            Use a template
          </span>
          <span className="mt-1 block text-12 leading-relaxed text-black-300">
            Pick from eight ready-made flows — connection, email and
            multichannel — and edit every step.
          </span>
        </button>
        <button
          type="button"
          onClick={onCreateFromScratch}
          data-testid="entry-from-scratch"
          className="rounded-2xl border border-black-600 bg-black-800 p-5 text-left hover:bg-black-700 transition-colors"
        >
          <PenLine className="h-6 w-6 text-black-200" />
          <span className="mt-3 block text-15 font-semibold text-white">
            Create from scratch
          </span>
          <span className="mt-1 block text-12 leading-relaxed text-black-300">
            An empty canvas. Add steps, delays and &quot;if connected&quot;
            branches exactly the way you want them.
          </span>
        </button>
      </div>
    </Modal>
  );
}

// ── Gallery + preview ───────────────────────────────────────────────────────

export function TemplateGalleryModal({
  open,
  onClose,
  onUse,
}: {
  open: boolean;
  onClose: () => void;
  onUse: (steps: SequenceStepDraft[]) => void;
}) {
  const [preview, setPreview] = React.useState<SequenceTemplate | null>(null);
  const previewSteps = React.useMemo(
    () => (preview ? preview.build() : []),
    [preview]
  );

  React.useEffect(() => {
    if (!open) setPreview(null);
  }, [open ]);

  if (preview) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={preview.name}
        description="Read-only preview — using the template drops an editable copy into your canvas."
        size="xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-xl bg-black-800 px-4 py-2 text-13 font-medium text-white border border-black-600 hover:bg-black-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onUse(preview.build())}
              data-testid="gallery-use-template"
              className="rounded-xl bg-purple-600 px-5 py-2 text-13 font-semibold text-white shadow-glow-purple hover:bg-purple-500"
            >
              Use template
            </button>
          </>
        }
      >
        <div className="mb-3 flex items-center gap-2">
          {preview.channels.map((ch) => (
            <span
              key={ch}
              className="inline-flex items-center gap-1 rounded-full border border-black-600 bg-black-800 px-2.5 py-1 text-11 font-medium text-black-200"
            >
              {ch === "email" ? (
                <Mail className="h-3 w-3 text-purple-400" />
              ) : (
                <MousePointerClick className="h-3 w-3 text-blue-400" />
              )}
              {ch === "email" ? "Email" : "LinkedIn"}
            </span>
          ))}
          <span className="text-12 text-black-400">
            {countSteps(previewSteps)} steps including branches
          </span>
        </div>
        <SequenceCanvas steps={previewSteps} readOnly />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sequence templates"
      description="Structures modeled on proven outreach flows — every message is an editable starting draft."
      size="xl"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {SEQUENCE_TEMPLATES.map((tpl) => {
          const steps = tpl.build();
          return (
            <div
              key={tpl.id}
              className="flex flex-col rounded-2xl border border-black-600 bg-black-800/80 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-14 font-semibold text-white">{tpl.name}</h3>
                <div className="flex shrink-0 gap-1.5">
                  {tpl.channels.map((ch) => (
                    <span
                      key={ch}
                      className="rounded-full border border-black-600 bg-black-900 px-2 py-0.5 text-10 font-semibold uppercase tracking-wide text-black-300"
                    >
                      {ch === "email" ? "Email" : "LinkedIn"}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-1.5 flex-1 text-12 leading-relaxed text-black-300">
                {tpl.blurb}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-11 text-black-400">
                  {countSteps(steps)} steps
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPreview(tpl)}
                    data-testid={`gallery-preview-${tpl.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-black-600 bg-black-800 px-3 py-1.5 text-12 font-medium text-black-100 hover:text-white"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => onUse(tpl.build())}
                    data-testid={`gallery-use-${tpl.id}`}
                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-12 font-semibold text-white hover:bg-purple-500"
                  >
                    Use template
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export default TemplateGalleryModal;
