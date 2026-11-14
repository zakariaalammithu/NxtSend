"use client";

import * as React from "react";
import Link from "next/link";
import {
  Search,
  Tag,
  Target,
  AlertTriangle,
  CheckCircle2,
  Info,
  ArrowRight,
  Users,
} from "lucide-react";
import { DemoBanner, Badge, Button, Spinner } from "@/components/ui";
import { getLeadsRepository, resolveWorkspaceId } from "@/lib/data";
import {
  parseIcpDescription,
  filterLeads,
  suggestListName,
  type ParsedIcp,
} from "@/lib/data/lead-finder";
import type { Lead } from "@/types";

const EXAMPLE_DESCRIPTION =
  "CFOs at fintech companies with 500+ people in London";

const STATUS_BADGE_VARIANT: Record<string, "success" | "blue" | "purple" | "gray" | "default"> = {
  replied: "success",
  contacted: "blue",
  converted: "purple",
  unresponsive: "gray",
  new: "default",
};

function leadDisplayName(lead: Lead): string {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  return name || lead.email || "Unnamed lead";
}

export default function LeadFinderPage() {
  const leadsRepo = React.useMemo(() => getLeadsRepository(), []);
  const isDemo = leadsRepo.mode === "demo";

  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [allLeads, setAllLeads] = React.useState<Lead[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [description, setDescription] = React.useState("");
  const [parsed, setParsed] = React.useState<ParsedIcp | null>(null);
  const [results, setResults] = React.useState<Lead[] | null>(null);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [tagName, setTagName] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);
  const [campaignTag, setCampaignTag] = React.useState<string | null>(null);

  // Load the workspace's leads once so the search runs over real data.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await resolveWorkspaceId();
        if (!ws) {
          if (!cancelled) {
            setLoadError("No workspace found. Sign in and try again.");
            setIsLoadingLeads(false);
          }
          return;
        }
        const leads = await leadsRepo.listLeads(ws);
        if (cancelled) return;
        setWorkspaceId(ws);
        setAllLeads(leads);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Could not load your leads."
          );
        }
      } finally {
        if (!cancelled) setIsLoadingLeads(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadsRepo]);

  const runSearch = () => {
    setSearchError(null);
    setSaveMessage(null);
    setCampaignTag(null);
    const trimmed = description.trim();
    if (!trimmed) {
      setSearchError("Describe your ideal buyer first — for example, the text below.");
      return;
    }
    setIsSearching(true);
    // Parsing is a pure, synchronous keyword match over the leads
    // already in this workspace. No AI call, no external database.
    const parsedIcp = parseIcpDescription(trimmed);
    const matches = filterLeads(allLeads, parsedIcp.filters);
    setParsed(parsedIcp);
    setResults(matches);
    setSelectedIds(new Set(matches.map((l) => l.id)));
    setTagName(suggestListName(trimmed, parsedIcp.filters));
    setHasSearched(true);
    setIsSearching(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!results) return;
    setSelectedIds((prev) =>
      prev.size === results.length
        ? new Set()
        : new Set(results.map((l) => l.id))
    );
  };

  const selectedLeads = (results ?? []).filter((l) => selectedIds.has(l.id));

  /** Applies the list tag to the selected leads; returns the tag used. */
  const applyListTag = async (): Promise<string | null> => {
    const tag = tagName.trim();
    if (!workspaceId) return null;
    if (!tag) {
      setSearchError("Give the list a tag name first.");
      return null;
    }
    if (selectedLeads.length === 0) {
      setSearchError("Select at least one lead to save as a list.");
      return null;
    }
    setIsSaving(true);
    setSearchError(null);
    try {
      const changed = await leadsRepo.applyTag(
        workspaceId,
        selectedLeads.map((l) => l.id),
        tag
      );
      setSaveMessage(
        changed > 0
          ? `Saved ${changed} lead${changed === 1 ? "" : "s"} to list "${tag}".`
          : `Those leads already carry the tag "${tag}" — nothing changed.`
      );
      return tag;
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Could not save the list."
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsList = async () => {
    await applyListTag();
  };

  const handleAddToCampaign = async () => {
    const tag = await applyListTag();
    if (tag) setCampaignTag(tag);
  };

  const criteriaChips: { label: string; values: string[] }[] = parsed
    ? [
        { label: "Titles", values: parsed.filters.jobTitles },
        { label: "Keywords", values: parsed.filters.keywords },
        { label: "Locations", values: parsed.filters.locations },
        {
          label: "Min. size",
          values:
            parsed.filters.minCompanySize !== null
              ? [`${parsed.filters.minCompanySize}+ people`]
              : [],
        },
        { label: "Status", values: parsed.filters.statuses },
      ].filter((c) => c.values.length > 0)
    : [];

  return (
    <div className="space-y-6">
      {isDemo && <DemoBanner feature="Lead Finder" />}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 font-bold text-white">Lead Finder</h1>
            {isDemo && (
              <Badge variant="demo" size="sm">
                Demo
              </Badge>
            )}
          </div>
          <p className="text-14 text-black-300 mt-1 max-w-2xl">
            Describe your ideal buyer and find the matching leads already in
            this workspace. This searches NxtSend&apos;s own leads — the ones
            you imported or added — not an external database.
          </p>
        </div>
        <div className="flex items-center gap-2 text-13 text-black-300">
          <Users className="h-4 w-4 text-purple-400" />
          {isLoadingLeads
            ? "Loading leads…"
            : `${allLeads.length} lead${allLeads.length === 1 ? "" : "s"} in this workspace`}
        </div>
      </div>

      {/* Honest scope note */}
      <div className="glass-card p-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
        <p className="text-13 text-black-300">
          Lead Finder only searches leads already in your workspace. It does
          not search an external lead database and it does not use AI — it
          matches keywords in your description against job titles, companies,
          tags, statuses and custom fields. An external lead database can be
          connected later via the{" "}
          <Link
            href="/dashboard/integrations"
            className="text-purple-400 font-medium hover:text-purple-300 underline"
          >
            Integration Center
          </Link>{" "}
          when configured.
        </p>
      </div>

      {loadError && (
        <div className="glass-card p-4 flex items-start gap-3 border-red-500/40">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-13 text-red-300">{loadError}</p>
        </div>
      )}

      {/* Search */}
      <div className="glass-card p-6 space-y-4">
        <label
          htmlFor="icp-description"
          className="block text-14 font-semibold text-white"
        >
          Describe your ideal buyer
        </label>
        <textarea
          id="icp-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={EXAMPLE_DESCRIPTION}
          rows={3}
          className="w-full rounded-xl border border-black-700 bg-black-800/80 px-3.5 py-2.5 text-14 text-white placeholder-black-400 focus:border-purple-500 focus:outline-none resize-y"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={runSearch}
            loading={isSearching || isLoadingLeads}
            leftIcon={<Search className="h-4 w-4" />}
          >
            Run search
          </Button>
          <button
            type="button"
            onClick={() => setDescription(EXAMPLE_DESCRIPTION)}
            className="text-13 text-purple-400 hover:text-purple-300 font-medium"
          >
            Use the example
          </button>
          {hasSearched && parsed && (
            <span className="text-13 text-black-400">
              {parsed.hasCriteria
                ? `${results?.length ?? 0} match${results?.length === 1 ? "" : "es"}`
                : "Nothing in that description matched a known title, industry, location or size."}
            </span>
          )}
        </div>

        {searchError && (
          <p className="text-13 text-red-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {searchError}
          </p>
        )}

        {hasSearched && parsed && parsed.hasCriteria && criteriaChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-12 font-semibold uppercase tracking-wider text-black-400">
              Understood as:
            </span>
            {criteriaChips.map((chip) => (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1.5 rounded-full bg-purple-600/15 border border-purple-500/30 px-2.5 py-1 text-12 text-purple-200"
              >
                <span className="font-semibold">{chip.label}:</span>
                {chip.values.join(", ")}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {isLoadingLeads ? (
        <div className="glass-card p-8 flex items-center justify-center gap-3 text-14 text-black-300">
          <Spinner size="md" />
          Loading your leads…
        </div>
      ) : !hasSearched ? (
        <div className="glass-card p-8 text-center space-y-2">
          <Search className="h-6 w-6 text-black-400 mx-auto" />
          <p className="text-14 font-semibold text-white">No search run yet</p>
          <p className="text-13 text-black-300">
            Describe your ideal buyer above and run a search. Only leads
            already in this workspace can match.
          </p>
        </div>
      ) : results !== null && results.length === 0 ? (
        <div className="glass-card p-8 text-center space-y-2">
          <Search className="h-6 w-6 text-black-400 mx-auto" />
          <p className="text-14 font-semibold text-white">No matching leads</p>
          <p className="text-13 text-black-300">
            {parsed && !parsed.hasCriteria
              ? "That description did not mention a job title, industry, location, company size or status we recognise. Try plainer words — for example, “CFOs at fintech companies”."
              : "No lead in this workspace matches all of the criteria above. Try dropping a detail (for example, the location or company size), or import more leads first."}
          </p>
        </div>
      ) : (
        results !== null && (
          <div className="glass-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-black-700/70">
              <p className="text-14 font-semibold text-white">
                {results.length} matching lead{results.length === 1 ? "" : "s"}
                <span className="text-black-400 font-normal">
                  {" "}
                  · {selectedIds.size} selected
                </span>
              </p>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-13 text-purple-400 hover:text-purple-300 font-medium"
              >
                {selectedIds.size === results.length
                  ? "Deselect all"
                  : "Select all"}
              </button>
            </div>

            <ul className="divide-y divide-black-700/50">
              {results.map((lead) => (
                <li key={lead.id} className="px-5 py-3.5 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(lead.id)}
                    onChange={() => toggleSelect(lead.id)}
                    aria-label={`Select ${leadDisplayName(lead)}`}
                    className="mt-1 h-4 w-4 shrink-0 accent-purple-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-14 font-semibold text-white truncate">
                        {leadDisplayName(lead)}
                      </span>
                      <Badge
                        variant={STATUS_BADGE_VARIANT[lead.status] ?? "default"}
                        size="sm"
                      >
                        {lead.status}
                      </Badge>
                    </div>
                    <p className="text-13 text-black-300 truncate">
                      {[lead.job_title, lead.company].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {lead.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {lead.tags.map((tag) => (
                          <Badge key={tag} variant="purple" size="sm">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {/* Save as list / Add to campaign */}
            <div className="border-t border-black-700/70 px-5 py-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor="list-tag-name"
                  className="text-13 font-medium text-black-300 flex items-center gap-1.5"
                >
                  <Tag className="h-3.5 w-3.5 text-purple-400" />
                  List name (tag)
                </label>
                <input
                  id="list-tag-name"
                  type="text"
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  placeholder="e.g. CFO Fintech"
                  className="flex-1 min-w-[180px] rounded-xl border border-black-700 bg-black-800/80 px-3 py-2 text-13 text-white placeholder-black-400 focus:border-purple-500 focus:outline-none"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveAsList}
                  loading={isSaving}
                  disabled={selectedLeads.length === 0}
                >
                  Save as list
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAddToCampaign}
                  loading={isSaving}
                  disabled={selectedLeads.length === 0}
                  leftIcon={<Target className="h-4 w-4" />}
                >
                  Add to campaign
                </Button>
              </div>
              <p className="text-12 text-black-400">
                Lists in NxtSend are tags: saving applies the tag to the
                selected leads, so the list shows up in the CRM and in
                campaign audiences.
              </p>
              {saveMessage && (
                <p className="text-13 text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {saveMessage}
                </p>
              )}
              {campaignTag && (
                <div className="rounded-xl bg-purple-600/10 border border-purple-500/30 p-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-13 text-purple-200">
                    List{" "}
                    <strong className="text-white">&ldquo;{campaignTag}&rdquo;</strong>{" "}
                    is ready. Create a campaign and pick the tag{" "}
                    <strong className="text-white">&ldquo;{campaignTag}&rdquo;</strong>{" "}
                    as its audience — the new-campaign page does not accept a
                    tag from a link, so choose it there.
                  </p>
                  <Link href="/dashboard/campaigns/new">
                    <Button variant="secondary" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>
                      Create campaign
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
