"use client";

/**
 * One LinkedIn audience-source tab of the campaign wizard (Step 2):
 * LinkedIn Search / Post engagement / Event attendees / Group members.
 *
 * The full Closely UI is here — instructions, URL input, "how many
 * people" count with the documented max notes, and example links —
 * with per-type URL validation. The HONEST state is equally explicit:
 * collecting people from LinkedIn requires an authorized LinkedIn
 * provider, and NxtSend has none connected (no scraping, no session
 * automation). Saving this form stores the source DEFINITION with the
 * campaign; collection starts when a provider is connected. No people
 * are ever generated from a URL.
 */

import * as React from "react";
import { Linkedin, AlertTriangle, CheckCircle2, PlugZap } from "lucide-react";
import {
  LINKEDIN_SOURCE_DEFS,
  validateLinkedinSource,
  type LinkedinSourceType,
} from "@/lib/data/audience-source";
import type { CampaignAudienceSource } from "@/types";

export interface LinkedinSourceFormProps {
  type: LinkedinSourceType;
  /** The source currently saved for this tab (if the user saved one). */
  savedSource: CampaignAudienceSource | null;
  /** Called with the validated definition when the user saves the source. */
  onSave: (source: CampaignAudienceSource) => void;
}

export function LinkedinSourceForm({
  type,
  savedSource,
  onSave,
}: LinkedinSourceFormProps) {
  const def = LINKEDIN_SOURCE_DEFS[type];
  const [url, setUrl] = React.useState(savedSource?.url ?? "");
  const [count, setCount] = React.useState<number>(savedSource?.requested_count ?? 500);
  const [error, setError] = React.useState<string | null>(null);
  const [justSaved, setJustSaved] = React.useState(false);

  // Sync the form when a saved source arrives/changes (e.g. the wizard
  // finishes loading a resumed draft). Keyed on the saved VALUES, so
  // ordinary re-renders — and the user's own unsaved typing — never
  // trigger a reset; right after the user saves, the values match what
  // they typed, making the sync a no-op.
  const savedUrl = savedSource?.url;
  const savedCount = savedSource?.requested_count;
  React.useEffect(() => {
    if (savedUrl) {
      setUrl(savedUrl);
      setCount(savedCount ?? 500);
    }
  }, [savedUrl, savedCount]);

  const handleSave = () => {
    const validationError = validateLinkedinSource(type, url, count);
    if (validationError) {
      setError(validationError);
      setJustSaved(false);
      return;
    }
    setError(null);
    onSave({ type, url: url.trim(), requested_count: count });
    setJustSaved(true);
  };

  return (
    <div className="space-y-6">
      {/* Provider honesty notice — always visible on these tabs. */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 flex gap-3">
        <PlugZap className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-13 font-semibold text-amber-200">
            Collecting people from LinkedIn needs a connected LinkedIn provider
          </p>
          <p className="text-12 text-black-300 leading-relaxed">
            No LinkedIn provider is connected to NxtSend, so nobody can be
            collected from this link yet. Saving stores the source definition
            with your campaign — collection starts automatically once an
            authorized LinkedIn provider is connected in the Integration
            Center. No results are invented in the meantime.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
        <div className="space-y-5">
          <div>
            <h3 className="text-16 font-bold text-white">{def.heading}</h3>
            <p className="text-13 text-black-300 mt-1 leading-relaxed">
              {def.instructions}
            </p>
          </div>

          <div>
            <label className="block text-13 font-medium text-black-200 mb-1.5">
              {def.urlLabel}
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
                setJustSaved(false);
              }}
              placeholder={def.urlPlaceholder}
              className="input-field"
              data-testid={`linkedin-source-url-${type}`}
            />
          </div>

          <div>
            <label className="block text-13 font-medium text-black-200 mb-1.5">
              How many people would you like to add?
            </label>
            <input
              type="number"
              min={1}
              value={count}
              onChange={(e) => {
                setCount(Number(e.target.value) || 0);
                setError(null);
                setJustSaved(false);
              }}
              className="input-field max-w-[220px]"
              data-testid={`linkedin-source-count-${type}`}
            />
            <p className="text-12 text-black-400 mt-1.5">{def.maxNote}</p>
            <p className="text-12 text-black-400">
              Note: the more people the longer the wait
            </p>
          </div>

          {error && (
            <div
              className="rounded-xl border border-rose-500/40 bg-rose-950/20 px-4 py-3 text-12 text-rose-200 flex items-center gap-2"
              data-testid={`linkedin-source-error-${type}`}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {justSaved && !error && (
            <div
              className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-12 text-emerald-200 flex items-center gap-2"
              data-testid={`linkedin-source-saved-${type}`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Source saved with this campaign. Collection starts when a
                LinkedIn provider is connected.
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            data-testid={`linkedin-source-save-${type}`}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2.5 text-13 font-semibold text-white shadow-glow-purple transition-all"
          >
            <Linkedin className="h-4 w-4" />
            <span>Save this source</span>
          </button>
        </div>

        {/* Example links panel (Closely's right-hand card). */}
        <div className="rounded-2xl border border-black-700 bg-black-800/60 p-5 space-y-4 h-fit">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0a66c2]/20 border border-[#0a66c2]/40">
              <Linkedin className="h-4 w-4 text-[#4b9be0]" />
            </span>
            <span className="text-13 font-semibold text-white">LinkedIn</span>
          </div>
          {def.examples.map((ex) => (
            <div key={ex.url}>
              <p className="text-12 font-medium text-black-200">{ex.label}</p>
              <p className="text-12 text-purple-300 break-all">{ex.url}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LinkedinSourceForm;
