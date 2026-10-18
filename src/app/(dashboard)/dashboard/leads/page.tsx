"use client";

import * as React from "react";
import { Plus, Upload, Trash2, Search, Linkedin, Target, Check, FileSpreadsheet } from "lucide-react";
import { DemoBanner, Badge, Modal } from "@/components/ui";
import { MOCK_LEADS, MOCK_CAMPAIGNS } from "@/lib/db/mock/data";
import { formatDate } from "@/lib/utils";
import type { Lead } from "@/types";

export default function LeadsPage() {
  const [leads, setLeads] = React.useState<Lead[]>(MOCK_LEADS);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [companyFilter] = React.useState<string>("all");

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = React.useState(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = React.useState(false);
  const [, setEnrollTargetLeadId] = React.useState<string | null>(null);

  // Add lead form state
  const [newFirstName, setNewFirstName] = React.useState("");
  const [newLastName, setNewLastName] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [newCompany, setNewCompany] = React.useState("");
  const [newJobTitle, setNewJobTitle] = React.useState("");
  const [newLinkedin, setNewLinkedin] = React.useState("");
  const [newTags, setNewTags] = React.useState("Outreach, Q4");

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

    return matchesSearch && matchesStatus && matchesCompany;
  });

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

  // Add Lead submit
  const handleAddLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newFirstName) return;

    const newLead: Lead = {
      id: `lead_demo_${Date.now()}`,
      workspace_id: "ws_demo_001",
      first_name: newFirstName,
      last_name: newLastName,
      email: newEmail,
      company: newCompany,
      job_title: newJobTitle,
      linkedin_url: newLinkedin || undefined,
      status: "new",
      tags: newTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      custom_fields: {},
      created_at: new Date().toISOString(),
    };

    setLeads([newLead, ...leads]);
    setIsAddModalOpen(false);
    // Reset form
    setNewFirstName("");
    setNewLastName("");
    setNewEmail("");
    setNewCompany("");
    setNewJobTitle("");
    setNewLinkedin("");
  };

  // Bulk actions
  const handleBulkDelete = () => {
    setLeads((prev) => prev.filter((l) => !selectedIds.includes(l.id)));
    setSelectedIds([]);
  };

  const handleDeleteSingle = (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setSelectedIds((prev) => prev.filter((i) => i !== id));
  };

  // CSV Mock Import
  const handleMockCsvImport = () => {
    const imported: Lead[] = [
      {
        id: `lead_imp_1`,
        workspace_id: "ws_demo_001",
        first_name: "Maya",
        last_name: "Lin",
        email: "maya.lin@openai.com",
        company: "OpenAI",
        job_title: "Product Marketing Lead",
        status: "new",
        tags: ["AI", "Tier-1"],
        custom_fields: {},
        created_at: new Date().toISOString(),
      },
      {
        id: `lead_imp_2`,
        workspace_id: "ws_demo_001",
        first_name: "Kenji",
        last_name: "Sato",
        email: "kenji@figma.com",
        company: "Figma",
        job_title: "Head of Community",
        status: "new",
        tags: ["Design", "Growth"],
        custom_fields: {},
        created_at: new Date().toISOString(),
      },
    ];

    setLeads([...imported, ...leads]);
    setIsCsvModalOpen(false);
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
            <span className="demo-badge">Demo Data</span>
          </div>
          <p className="mt-1 text-14 text-black-300">
            Manage prospects, enrich contacts, and enroll leads into outreach pipelines.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsCsvModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-black-800 hover:bg-black-700 border border-black-600 px-4 py-2.5 text-13 font-medium text-white transition-colors"
          >
            <Upload className="h-4 w-4 text-orange-400" />
            <span>Import CSV</span>
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

        <div className="flex items-center gap-3 w-full md:w-auto">
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
        </div>
      </div>

      {/* Bulk Action Banner (when items are checked) */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-2xl bg-purple-950/40 border border-purple-500/40 px-5 py-3 text-13 text-white animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-purple-300">
              {selectedIds.length} leads selected
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsEnrollModalOpen(true)}
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
              {filteredLeads.map((lead) => {
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
                            <span className="demo-badge text-10 py-0 px-1.5">
                              Demo
                            </span>
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
      </div>

      {/* CSV IMPORT MODAL */}
      <Modal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        title="Import Leads via CSV"
        size="lg"
      >
        <div className="space-y-5">
          <div className="rounded-2xl border-2 border-dashed border-black-600 bg-black-900/50 p-8 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600/10 text-purple-400 border border-purple-500/20">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <p className="text-14 font-medium text-white">
                Drag and drop your CSV file here, or click to browse
              </p>
              <p className="text-12 text-black-400 mt-1">
                Supports columns: First Name, Last Name, Email, LinkedIn, Company, Title
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-13 font-semibold text-white mb-2">
              Preview (Sample 2 Records):
            </h4>
            <div className="rounded-xl border border-black-700 bg-black-900/60 p-3 text-12 font-mono text-black-300 space-y-1">
              <div>Maya Lin, maya.lin@openai.com, OpenAI, Product Marketing</div>
              <div>Kenji Sato, kenji@figma.com, Figma, Head of Community</div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-black-700">
            <button
              type="button"
              onClick={() => setIsCsvModalOpen(false)}
              className="rounded-xl bg-black-800 hover:bg-black-700 px-4 py-2 text-13 font-medium text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMockCsvImport}
              className="rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white shadow-glow-purple"
            >
              Import 2 Leads
            </button>
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
            Select an active campaign to enroll the selected leads:
          </p>
          <div className="space-y-2">
            {MOCK_CAMPAIGNS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setIsEnrollModalOpen(false)}
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
          </div>
        </div>
      </Modal>
    </div>
  );
}
