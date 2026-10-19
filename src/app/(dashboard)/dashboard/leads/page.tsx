"use client";

import * as React from "react";
import { Plus, Upload, Download, Trash2, Search, Linkedin, Target, Check, FileSpreadsheet, AlertTriangle, Tags, Copy, ChevronLeft, ChevronRight, X } from "lucide-react";
import { DemoBanner, Badge, Modal } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import {
  getCampaignsRepository,
  getLeadsRepository,
  resolveWorkspaceId,
} from "@/lib/data";
import {
  findDuplicateGroups,
  countDuplicatedLeads,
  type DuplicateGroup,
} from "@/lib/data/duplicates";
import {
  LEAD_FIELDS,
  leadsToCsv,
  parseCsv,
  processCsvImport,
  suggestColumnMapping,
  type ColumnMapping,
  type CsvImportResult,
} from "@/lib/data/csv";
import type { Campaign, Lead } from "@/types";

type CsvStage = "pick" | "map" | "done";

export default function LeadsPage() {
  const leadsRepo = React.useMemo(() => getLeadsRepository(), []);
  const campaignsRepo = React.useMemo(() => getCampaignsRepository(), []);
  const isDemo = leadsRepo.mode === "demo";

  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [companyFilter] = React.useState<string>("all");
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionNotice, setActionNotice] = React.useState<string | null>(null);

  // CRM polish: tag (list) filter + management, pagination, duplicates.
  const [tagFilter, setTagFilter] = React.useState<string>("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [showTagManager, setShowTagManager] = React.useState(false);
  const [showDuplicates, setShowDuplicates] = React.useState(false);
  const [renameDrafts, setRenameDrafts] = React.useState<Record<string, string>>({});
  const [confirmDeleteTag, setConfirmDeleteTag] = React.useState<string | null>(null);
  const [bulkTagName, setBulkTagName] = React.useState("");

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = React.useState(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = React.useState(false);
  const [enrollTargetLeadId, setEnrollTargetLeadId] = React.useState<string | null>(null);

  // Add lead form state
  const [newFirstName, setNewFirstName] = React.useState("");
  const [newLastName, setNewLastName] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [newCompany, setNewCompany] = React.useState("");
  const [newJobTitle, setNewJobTitle] = React.useState("");
  const [newLinkedin, setNewLinkedin] = React.useState("");
  const [newTags, setNewTags] = React.useState("Outreach, Q4");

  // CSV import state
  const [csvStage, setCsvStage] = React.useState<CsvStage>("pick");
  const [csvFileName, setCsvFileName] = React.useState("");
  const [csvHeaders, setCsvHeaders] = React.useState<string[]>([]);
  const [csvRows, setCsvRows] = React.useState<string[][]>([]);
  const [csvMapping, setCsvMapping] = React.useState<ColumnMapping>({});
  const [importResult, setImportResult] = React.useState<CsvImportResult | null>(null);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Data loading through the repository layer (Supabase when configured,
  // labelled demo store otherwise).
  // ---------------------------------------------------------------------------
  const loadData = React.useCallback(async () => {
    const ws = await resolveWorkspaceId();
    setWorkspaceId(ws);
    if (!ws) {
      setLeads([]);
      setCampaigns([]);
      return;
    }
    const [leadRows, campaignRows] = await Promise.all([
      leadsRepo.listLeads(ws),
      campaignsRepo.listCampaigns(ws),
    ]);
    setLeads(leadRows);
    setCampaigns(campaignRows);
  }, [leadsRepo, campaignsRepo]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadData();
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load leads."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  // Tags are the list model: derived from the loaded leads (which come
  // from the repository), with per-tag counts for the manager panel.
  const tagCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      for (const t of lead.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }, [leads]);

  const duplicateGroups: DuplicateGroup[] = React.useMemo(
    () => findDuplicateGroups(leads),
    [leads]
  );

  // Filtered Leads
  const filteredLeads = leads.filter((lead) => {
    const fullName = `${lead.first_name || ""} ${lead.last_name || ""}`.toLowerCase();
    const matchesSearch =
      fullName.includes(searchQuery.toLowerCase()) ||
      (lead.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.company || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    const matchesCompany =
      companyFilter === "all" ||
      (lead.company && lead.company.toLowerCase() === companyFilter.toLowerCase());
    const matchesTag = tagFilter === "all" || (lead.tags ?? []).includes(tagFilter);

    return matchesSearch && matchesStatus && matchesCompany && matchesTag;
  });

  // Pagination over the filtered set.
  const pageCount = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedLeads = filteredLeads.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, tagFilter, pageSize]);

  // Select all toggle
  const allSelected =
    filteredLeads.length > 0 && selectedIds.length === filteredLeads.length;

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredLeads.map((l) => l.id));
    }
  };

  const handleToggleLead = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Add Lead submit — persists through the repository.
  const handleAddLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newFirstName || !workspaceId) return;
    setActionError(null);
    try {
      const newLead = await leadsRepo.createLead(workspaceId, {
        first_name: newFirstName,
        last_name: newLastName || undefined,
        email: newEmail,
        company: newCompany || undefined,
        job_title: newJobTitle || undefined,
        linkedin_url: newLinkedin || undefined,
        tags: newTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setLeads((prev) => [newLead, ...prev]);
      setIsAddModalOpen(false);
      setNewFirstName("");
      setNewLastName("");
      setNewEmail("");
      setNewCompany("");
      setNewJobTitle("");
      setNewLinkedin("");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to add the lead."
      );
    }
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    setActionError(null);
    try {
      await leadsRepo.deleteLeads(selectedIds);
      setLeads((prev) => prev.filter((l) => !selectedIds.includes(l.id)));
      setSelectedIds([]);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete the leads."
      );
    }
  };

  const handleDeleteSingle = async (id: string) => {
    setActionError(null);
    try {
      await leadsRepo.deleteLead(id);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete the lead."
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Lists & tags management — tags are the list model; every operation
  // goes through the repository and the list is re-read afterwards.
  // ---------------------------------------------------------------------------
  const runTagOp = async (op: () => Promise<number>, done: string) => {
    if (!workspaceId) return;
    setActionError(null);
    setActionNotice(null);
    try {
      const changed = await op();
      await loadData();
      setActionNotice(`${done} (${changed} lead${changed === 1 ? "" : "s"} updated).`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The tag operation failed.");
    }
  };

  const handleRenameTag = async (from: string) => {
    const to = (renameDrafts[from] ?? "").trim();
    if (!to || to === from || !workspaceId) return;
    await runTagOp(
      () => leadsRepo.renameTag(workspaceId, from, to),
      `Renamed list "${from}" to "${to}"`
    );
    setRenameDrafts((prev) => {
      const next = { ...prev };
      delete next[from];
      return next;
    });
    if (tagFilter === from) setTagFilter(to);
  };

  const handleDeleteTag = async (tag: string) => {
    if (!workspaceId) return;
    await runTagOp(
      () => leadsRepo.deleteTag(workspaceId, tag),
      `Removed list "${tag}" from its leads`
    );
    setConfirmDeleteTag(null);
    if (tagFilter === tag) setTagFilter("all");
  };

  const handleBulkTag = async (mode: "apply" | "remove") => {
    const tag = bulkTagName.trim();
    if (!tag || selectedIds.length === 0 || !workspaceId) return;
    await runTagOp(
      () =>
        mode === "apply"
          ? leadsRepo.applyTag(workspaceId, selectedIds, tag)
          : leadsRepo.removeTag(workspaceId, selectedIds, tag),
      mode === "apply" ? `Tagged selected leads as "${tag}"` : `Removed "${tag}" from selected leads`
    );
    if (mode === "apply") setBulkTagName("");
  };

  // ---------------------------------------------------------------------------
  // CSV export — a real download of the currently filtered leads.
  // ---------------------------------------------------------------------------
  const handleExportCsv = () => {
    const csv = leadsToCsv(filteredLeads);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nxtsend-leads.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // CSV import — real parsing, column mapping, validation, dedupe.
  // ---------------------------------------------------------------------------
  const resetCsvState = () => {
    setCsvStage("pick");
    setCsvFileName("");
    setCsvHeaders([]);
    setCsvRows([]);
    setCsvMapping({});
    setImportResult(null);
    setImportError(null);
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCsvFileChosen = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setImportError(
          "That file has no data rows — it needs a header row plus at least one lead row."
        );
        return;
      }
      const headers = rows[0].map((h) => h.trim());
      setCsvFileName(file.name);
      setCsvHeaders(headers);
      setCsvRows(rows);
      setCsvMapping(suggestColumnMapping(headers));
      setCsvStage("map");
    } catch {
      setImportError("Could not read that file. Please choose a valid CSV file.");
    }
  };

  const handleRunImport = async () => {
    if (!workspaceId) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const result = processCsvImport(
        csvRows,
        csvMapping,
        leads.map((l) => l.email ?? "")
      );
      if (result.leads.length > 0) {
        const created = await leadsRepo.importLeads(workspaceId, result.leads);
        setLeads((prev) => [...created, ...prev]);
      }
      setImportResult(result);
      setCsvStage("done");
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "The import failed. No leads were added."
      );
    } finally {
      setIsImporting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Enrollment — records a real assignment in the campaigns repository.
  // Sequence execution stays simulated; only the assignment is recorded.
  // ---------------------------------------------------------------------------
  const handleEnroll = async (campaign: Campaign) => {
    if (!workspaceId) return;
    const leadIds = enrollTargetLeadId
      ? [enrollTargetLeadId]
      : selectedIds;
    if (leadIds.length === 0) return;
    setActionError(null);
    setActionNotice(null);
    try {
      const { enrolled, skipped } = await campaignsRepo.enrollLeads(
        workspaceId,
        campaign.id,
        leadIds
      );
      setActionNotice(
        `Enrolled ${enrolled} lead(s) into "${campaign.name}"` +
          (skipped > 0 ? ` — ${skipped} already enrolled, skipped.` : ".") +
          (isDemo ? " Assignment saved in the demo store; sequence execution is simulated." : "")
      );
      setIsEnrollModalOpen(false);
      setEnrollTargetLeadId(null);
      setSelectedIds([]);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to enroll the leads."
      );
      setIsEnrollModalOpen(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <DemoBanner feature="Lead Database" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
              Leads & Contacts
            </h1>
            {isDemo && <span className="demo-badge">Demo Data</span>}
          </div>
          <p className="mt-1 text-14 text-black-300">
            Manage prospects, enrich contacts, and enroll leads into outreach pipelines.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              resetCsvState();
              setIsCsvModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2.5 text-13 font-medium text-white transition-colors"
          >
            <Upload className="h-4 w-4 text-orange-400" />
            <span>Import CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredLeads.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2.5 text-13 font-medium text-white transition-colors disabled:opacity-40"
          >
            <Download className="h-4 w-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-13 font-semibold text-white shadow-glow-purple transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Add Lead</span>
          </button>
        </div>
      </div>

      {/* Load / action feedback */}
      {loadError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}
      {actionError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
      {actionNotice && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 px-5 py-3 text-13 text-emerald-200">
          {actionNotice}
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, company..."
            className="input-field pl-10 py-2.5 text-13"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* Status Filter */}
          <div className="flex items-center gap-2 flex-1 md:flex-initial">
            <span className="text-12 text-black-400 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="replied">Replied</option>
              <option value="converted">Converted</option>
              <option value="unresponsive">Unresponsive</option>
            </select>
          </div>

          {/* List (tag) Filter */}
          <div className="flex items-center gap-2 flex-1 md:flex-initial">
            <span className="text-12 text-black-400 font-medium">List:</span>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
              aria-label="Filter by list (tag)"
            >
              <option value="all">All lists</option>
              {tagCounts.map(({ tag }) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>

          {/* Page size */}
          <div className="flex items-center gap-2">
            <span className="text-12 text-black-400 font-medium">Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
              aria-label="Leads per page"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
            </select>
          </div>
        </div>
      </div>

      {/* CRM tools toolbar: lists & tags manager + duplicates review */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => setShowTagManager((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-12 font-medium transition-colors border ${
            showTagManager
              ? "bg-purple-600 text-white border-purple-500"
              : "bg-black-800 hover:bg-black-700 border-black-600 text-white"
          }`}
        >
          <Tags className="h-3.5 w-3.5" />
          <span>Manage Lists & Tags ({tagCounts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setShowDuplicates((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-12 font-medium transition-colors border ${
            showDuplicates
              ? "bg-purple-600 text-white border-purple-500"
              : "bg-black-800 hover:bg-black-700 border-black-600 text-white"
          }`}
        >
          <Copy className="h-3.5 w-3.5" />
          <span>
            Possible Duplicates ({duplicateGroups.length} groups ·{" "}
            {countDuplicatedLeads(duplicateGroups)} leads)
          </span>
        </button>
      </div>

      {/* Lists & Tags manager panel */}
      {showTagManager && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-15 font-semibold text-white">Lists & Tags</h3>
              <p className="text-12 text-black-400 mt-0.5">
                Lists are tags on leads. Renaming or removing a list updates
                every lead in it, through the data layer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTagManager(false)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-700/50"
              aria-label="Close lists manager"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {tagCounts.length === 0 && (
            <p className="text-13 text-black-400">
              No lists yet. Tag a lead (Add Lead, CSV import, or select leads
              and use the tag box in the selection bar) to create one.
            </p>
          )}
          <div className="divide-y divide-black-700/50">
            {tagCounts.map(({ tag, count }) => (
              <div key={tag} className="py-3 flex flex-wrap items-center gap-3">
                <span className="rounded-md bg-purple-600/15 border border-purple-500/30 px-2 py-1 text-12 font-semibold text-purple-200 min-w-[90px] text-center">
                  {tag}
                </span>
                <span className="text-12 text-black-400">
                  {count} lead{count === 1 ? "" : "s"}
                </span>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  <input
                    type="text"
                    value={renameDrafts[tag] ?? ""}
                    onChange={(e) =>
                      setRenameDrafts((prev) => ({ ...prev, [tag]: e.target.value }))
                    }
                    placeholder={`Rename "${tag}" to…`}
                    className="input-field py-1.5 text-12 w-44"
                    aria-label={`New name for ${tag}`}
                  />
                  <button
                    type="button"
                    disabled={!renameDrafts[tag]?.trim() || renameDrafts[tag]?.trim() === tag}
                    onClick={() => handleRenameTag(tag)}
                    className="rounded-lg bg-black-700 hover:bg-black-600 px-3 py-1.5 text-12 font-medium text-white disabled:opacity-40"
                  >
                    Rename
                  </button>
                  {confirmDeleteTag === tag ? (
                    <>
                      <span className="text-12 text-rose-300">Remove from all leads?</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteTag(tag)}
                        className="rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-12 font-semibold text-white"
                      >
                        Confirm remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTag(null)}
                        className="rounded-lg bg-black-700 hover:bg-black-600 px-3 py-1.5 text-12 font-medium text-white"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTag(tag)}
                      className="rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 px-3 py-1.5 text-12 font-medium text-rose-300"
                    >
                      Delete list
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Possible duplicates panel */}
      {showDuplicates && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-15 font-semibold text-white">Possible Duplicates</h3>
              <p className="text-12 text-black-400 mt-0.5">
                Groups sharing an email address, or the same name at the same
                company. Nothing is merged automatically — review and delete
                the records you don&apos;t need.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDuplicates(false)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-black-400 hover:text-white hover:bg-black-700/50"
              aria-label="Close duplicates review"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {duplicateGroups.length === 0 && (
            <p className="text-13 text-black-400">
              No possible duplicates found in the current lead set.
            </p>
          )}
          <div className="space-y-4">
            {duplicateGroups.map((group) => (
              <div
                key={`${group.reason}:${group.key}`}
                className="rounded-xl border border-black-700 bg-black-800/40 p-4 space-y-2"
              >
                <p className="text-12 font-semibold text-amber-300">
                  {group.reason === "email"
                    ? `Same email: ${group.key}`
                    : `Same name & company: ${group.key}`}
                </p>
                <div className="divide-y divide-black-700/50">
                  {group.leads.map((lead) => (
                    <div key={lead.id} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-13 font-medium text-white truncate">
                          {lead.first_name} {lead.last_name}
                          <span className="text-black-400 font-normal">
                            {" "}
                            · {lead.email} · {lead.company || "—"} · {lead.status}
                          </span>
                        </p>
                        <p className="text-11 text-black-500">
                          Added {formatDate(lead.created_at, "short")} · tags:{" "}
                          {lead.tags.length ? lead.tags.join(", ") : "none"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSingle(lead.id)}
                        className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-rose-400 hover:bg-rose-950/30"
                        title="Delete this lead"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Action Banner (when items are checked) */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-2xl bg-purple-950/40 border border-purple-500/40 px-5 py-3 text-13 text-white animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-purple-300">
              {selectedIds.length} leads selected
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Tag / untag the selection */}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={bulkTagName}
                onChange={(e) => setBulkTagName(e.target.value)}
                placeholder="List / tag name…"
                className="rounded-lg border border-purple-500/40 bg-black-900/60 px-2.5 py-1.5 text-12 text-white placeholder-black-500 focus:outline-none focus:border-purple-400 w-36"
                aria-label="Tag name for selected leads"
              />
              <button
                type="button"
                disabled={!bulkTagName.trim()}
                onClick={() => handleBulkTag("apply")}
                className="rounded-lg bg-black-700 hover:bg-black-600 px-3 py-1.5 text-12 font-medium text-white disabled:opacity-40"
              >
                Tag
              </button>
              <button
                type="button"
                disabled={!bulkTagName.trim()}
                onClick={() => handleBulkTag("remove")}
                className="rounded-lg bg-black-700 hover:bg-black-600 px-3 py-1.5 text-12 font-medium text-white disabled:opacity-40"
              >
                Untag
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setEnrollTargetLeadId(null);
                setIsEnrollModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-1.5 text-12 font-medium text-white transition-colors"
            >
              <Target className="h-3.5 w-3.5" />
              <span>Enroll in Campaign</span>
            </button>

            <button
              type="button"
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 px-3 py-1.5 text-12 font-medium text-rose-300 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-13 border-collapse">
            <thead>
              <tr className="border-b border-black-700/80 bg-black-800/40 text-11 font-semibold uppercase tracking-wider text-black-400">
                <th className="py-3.5 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleToggleSelectAll}
                    className="h-4 w-4 rounded border-black-600 bg-black-800 text-purple-600"
                  />
                </th>
                <th className="py-3.5 px-4">Lead Name</th>
                <th className="py-3.5 px-4">Company</th>
                <th className="py-3.5 px-4">Job Title</th>
                <th className="py-3.5 px-3">LinkedIn</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Tags</th>
                <th className="py-3.5 px-4">Added</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black-700/50">
              {isLoading && (
                <tr>
                  <td colSpan={9} className="py-10 px-4 text-center text-black-400">
                    Loading leads…
                  </td>
                </tr>
              )}
              {!isLoading && filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 px-4 text-center text-black-400">
                    No leads found. Add a lead or import a CSV to get started.
                  </td>
                </tr>
              )}
              {pagedLeads.map((lead) => {
                const isSelected = selectedIds.includes(lead.id);
                const initials = `${lead.first_name?.[0] || ""}${lead.last_name?.[0] || ""}`.toUpperCase();

                return (
                  <tr
                    key={lead.id}
                    className={`table-row-hover ${isSelected ? "bg-purple-950/20" : ""}`}
                  >
                    <td className="py-4 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleLead(lead.id)}
                        className="h-4 w-4 rounded border-black-600 bg-black-800 text-purple-600"
                      />
                    </td>

                    {/* Avatar + Name + Email */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-purple-300 text-11 font-bold border border-purple-500/30">
                          {initials || "LD"}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate flex items-center gap-1.5">
                            <span>
                              {lead.first_name} {lead.last_name}
                            </span>
                            {isDemo && (
                              <span className="demo-badge text-10 py-0 px-1.5">
                                Demo
                              </span>
                            )}
                          </div>
                          <div className="text-11 text-black-400 truncate">
                            {lead.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Company */}
                    <td className="py-4 px-4 font-medium text-white">
                      {lead.company || "—"}
                    </td>

                    {/* Job Title */}
                    <td className="py-4 px-4 text-black-300">
                      {lead.job_title || "—"}
                    </td>

                    {/* LinkedIn Link */}
                    <td className="py-4 px-3">
                      {lead.linkedin_url ? (
                        <a
                          href={lead.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/15 text-blue-400 hover:bg-blue-600/30 transition-colors"
                          title="LinkedIn Profile"
                        >
                          <Linkedin className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-black-600">—</span>
                      )}
                    </td>

                    {/* Status badge */}
                    <td className="py-4 px-4">
                      <Badge
                        variant={
                          lead.status === "replied"
                            ? "green"
                            : lead.status === "contacted"
                            ? "blue"
                            : lead.status === "converted"
                            ? "purple"
                            : lead.status === "unresponsive"
                            ? "red"
                            : "gray"
                        }
                      >
                        {lead.status}
                      </Badge>
                    </td>

                    {/* Tags */}
                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {lead.tags.slice(0, 2).map((t, idx) => (
                          <span
                            key={idx}
                            className="rounded-md bg-black-700/80 px-1.5 py-0.5 text-10 text-black-300"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Added Date */}
                    <td className="py-4 px-4 text-12 text-black-400 whitespace-nowrap">
                      {formatDate(lead.created_at, "short")}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEnrollTargetLeadId(lead.id);
                            setIsEnrollModalOpen(true);
                          }}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-purple-400 hover:bg-purple-600/20"
                          title="Enroll in Campaign"
                        >
                          <Target className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteSingle(lead.id)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-rose-400 hover:bg-rose-950/30"
                          title="Delete Lead"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredLeads.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-black-700/70 text-12 text-black-300">
            <span>
              Showing{" "}
              <strong className="text-white">
                {(safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, filteredLeads.length)}
              </strong>{" "}
              of <strong className="text-white">{filteredLeads.length}</strong>{" "}
              leads
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                className="inline-flex items-center gap-1 rounded-lg bg-black-800 hover:bg-black-700 border border-black-600 px-2.5 py-1.5 font-medium text-white disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Prev</span>
              </button>
              <span className="text-black-400">
                Page <strong className="text-white">{safePage}</strong> of{" "}
                {pageCount}
              </span>
              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
                className="inline-flex items-center gap-1 rounded-lg bg-black-800 hover:bg-black-700 border border-black-600 px-2.5 py-1.5 font-medium text-white disabled:opacity-40"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CSV IMPORT MODAL — real file parsing, mapping, validation, dedupe */}
      <Modal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        title="Import Leads via CSV"
        size="lg"
      >
        <div className="space-y-5">
          {csvStage === "pick" && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-2xl border-2 border-dashed border-black-600 bg-black-900/50 p-8 text-center space-y-3 hover:border-purple-500/50 transition-colors"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600/10 text-purple-400 border border-purple-500/20">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-14 font-medium text-white">
                    Click to choose a CSV file from your computer
                  </p>
                  <p className="text-12 text-black-400 mt-1">
                    The file is parsed in your browser. You will map its columns
                    to lead fields before anything is imported.
                  </p>
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleCsvFileChosen(file);
                }}
              />
              {isDemo && (
                <p className="text-12 text-orange-300/90">
                  Demo mode: imported leads are stored in this browser
                  (localStorage) only — they are not uploaded anywhere.
                </p>
              )}
            </>
          )}

          {csvStage === "map" && (
            <>
              <div>
                <h4 className="text-13 font-semibold text-white">
                  Map columns — {csvFileName}
                </h4>
                <p className="text-12 text-black-400 mt-1">
                  {Math.max(csvRows.length - 1, 0)} data row(s) found. Match each
                  lead field to a column in your file. Email and First Name are
                  required; rows that fail validation or duplicate an existing
                  email are reported, not imported.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {LEAD_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="block text-12 text-black-300 mb-1">
                      {field.label}
                      {field.required ? " *" : ""}
                    </label>
                    <select
                      value={csvMapping[field.key] ?? ""}
                      onChange={(e) =>
                        setCsvMapping((prev) => ({
                          ...prev,
                          [field.key]: e.target.value || undefined,
                        }))
                      }
                      className="w-full rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="">— Not mapped —</option>
                      {csvHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div>
                <h4 className="text-13 font-semibold text-white mb-2">
                  Preview (first rows of your file):
                </h4>
                <div className="rounded-xl border border-black-700 bg-black-900/60 p-3 text-12 font-mono text-black-300 space-y-1 overflow-x-auto">
                  {csvRows.slice(0, 4).map((row, i) => (
                    <div key={i} className="whitespace-nowrap">
                      {row.join(", ")}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {csvStage === "done" && importResult && (
            <div className="space-y-4">
              <h4 className="text-14 font-semibold text-white">Import summary</h4>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/30 p-3">
                  <div className="text-20 font-bold text-emerald-300">
                    {importResult.leads.length}
                  </div>
                  <div className="text-11 text-black-300">Added</div>
                </div>
                <div className="rounded-xl bg-amber-950/30 border border-amber-500/30 p-3">
                  <div className="text-20 font-bold text-amber-300">
                    {importResult.duplicates.length}
                  </div>
                  <div className="text-11 text-black-300">Duplicates skipped</div>
                </div>
                <div className="rounded-xl bg-rose-950/30 border border-rose-500/30 p-3">
                  <div className="text-20 font-bold text-rose-300">
                    {importResult.errors.length}
                  </div>
                  <div className="text-11 text-black-300">Rows with errors</div>
                </div>
              </div>

              {importResult.duplicates.length > 0 && (
                <div>
                  <h5 className="text-12 font-semibold text-amber-300 mb-1">
                    Duplicates (by email):
                  </h5>
                  <ul className="text-12 text-black-300 space-y-0.5 max-h-28 overflow-y-auto">
                    {importResult.duplicates.slice(0, 10).map((d, i) => (
                      <li key={i}>
                        Row {d.row}: {d.email} —{" "}
                        {d.reason === "existing"
                          ? "already in your leads"
                          : "duplicate inside the file"}
                      </li>
                    ))}
                    {importResult.duplicates.length > 10 && (
                      <li>…and {importResult.duplicates.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div>
                  <h5 className="text-12 font-semibold text-rose-300 mb-1">
                    Row errors:
                  </h5>
                  <ul className="text-12 text-black-300 space-y-0.5 max-h-28 overflow-y-auto">
                    {importResult.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>
                        Row {e.row}: {e.messages.join("; ")}
                      </li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li>…and {importResult.errors.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}

              {isDemo && (
                <p className="text-12 text-orange-300/90">
                  Demo mode: the added leads were saved to this browser&apos;s
                  demo store (localStorage).
                </p>
              )}
            </div>
          )}

          {importError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 px-4 py-3 text-12 text-rose-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-black-700">
            <button
              type="button"
              onClick={() => setIsCsvModalOpen(false)}
              className="rounded-xl bg-black-800 hover:bg-black-700 px-4 py-2 text-13 font-medium text-white"
            >
              {csvStage === "done" ? "Close" : "Cancel"}
            </button>
            {csvStage === "map" && (
              <button
                type="button"
                disabled={isImporting || !csvMapping.email || !csvMapping.first_name}
                onClick={handleRunImport}
                className="rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white shadow-glow-purple disabled:opacity-40"
              >
                {isImporting ? "Importing…" : "Validate & Import"}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* ADD LEAD MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Lead"
      >
        <form onSubmit={handleAddLeadSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-12 text-black-300 mb-1">First Name *</label>
              <input
                type="text"
                required
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                placeholder="Jane"
                className="input-field py-2 text-13"
              />
            </div>
            <div>
              <label className="block text-12 text-black-300 mb-1">Last Name</label>
              <input
                type="text"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                placeholder="Doe"
                className="input-field py-2 text-13"
              />
            </div>
          </div>

          <div>
            <label className="block text-12 text-black-300 mb-1">Work Email *</label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="jane.doe@company.com"
              className="input-field py-2 text-13"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-12 text-black-300 mb-1">Company</label>
              <input
                type="text"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="Linear"
                className="input-field py-2 text-13"
              />
            </div>
            <div>
              <label className="block text-12 text-black-300 mb-1">Job Title</label>
              <input
                type="text"
                value={newJobTitle}
                onChange={(e) => setNewJobTitle(e.target.value)}
                placeholder="Head of Engineering"
                className="input-field py-2 text-13"
              />
            </div>
          </div>

          <div>
            <label className="block text-12 text-black-300 mb-1">LinkedIn Profile URL</label>
            <input
              type="url"
              value={newLinkedin}
              onChange={(e) => setNewLinkedin(e.target.value)}
              placeholder="https://linkedin.com/in/janedoe"
              className="input-field py-2 text-13"
            />
          </div>

          <div>
            <label className="block text-12 text-black-300 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder="Executive, Fintech, High Priority"
              className="input-field py-2 text-13"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-black-700">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="rounded-xl bg-black-800 hover:bg-black-700 px-4 py-2 text-13 font-medium text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2 text-13 font-semibold text-white shadow-glow-purple"
            >
              Add Lead
            </button>
          </div>
        </form>
      </Modal>

      {/* ENROLL MODAL */}
      <Modal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        title="Enroll in Campaign"
      >
        <div className="space-y-4">
          <p className="text-13 text-black-300">
            Select a campaign to enroll{" "}
            {enrollTargetLeadId ? "this lead" : "the selected leads"}:
          </p>
          <div className="space-y-2">
            {campaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleEnroll(c)}
                className="flex w-full items-center justify-between rounded-xl border border-black-700 bg-black-800/80 hover:bg-purple-600/15 hover:border-purple-500 p-3 text-left transition-colors"
              >
                <div>
                  <span className="font-semibold text-white text-13 block">
                    {c.name}
                  </span>
                  <span className="text-11 text-black-400 capitalize">
                    {c.type} sequence &bull; {c.status}
                  </span>
                </div>
                <Check className="h-4 w-4 text-purple-400" />
              </button>
            ))}
            {campaigns.length === 0 && (
              <p className="text-12 text-black-400">
                No campaigns exist yet. Create a campaign first.
              </p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
