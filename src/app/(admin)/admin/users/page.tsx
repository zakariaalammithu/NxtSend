"use client";

import * as React from "react";
import { Search, Shield, Trash2, AlertTriangle } from "lucide-react";
import { Badge, Modal } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { getAdminRepository, type AdminUserRecord } from "@/lib/data";
import type { UserRole } from "@/types";

type AdminUser = AdminUserRecord;

export default function AdminUsersPage() {
  const adminRepo = React.useMemo(() => getAdminRepository(), []);
  const isDemo = adminRepo.mode === "demo";

  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");

  // Users load through the admin repository: the demo store in demo mode,
  // or GET /api/admin/users in Supabase mode — a route that verifies the
  // caller's admin role server-side before reading with the service role.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await adminRepo.listUsers();
        if (!cancelled) setUsers(rows);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load users."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminRepo]);

  // Role change modal state
  const [roleModalOpen, setRoleModalOpen] = React.useState(false);
  const [targetUser, setTargetUser] = React.useState<AdminUser | null>(null);
  const [selectedNewRole, setSelectedNewRole] = React.useState<UserRole>("user");

  // Profile modal state
  const [profileModalOpen, setProfileModalOpen] = React.useState(false);
  const [viewingUser, setViewingUser] = React.useState<AdminUser | null>(null);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleOpenRoleModal = (user: AdminUser, newRole: UserRole) => {
    setTargetUser(user);
    setSelectedNewRole(newRole);
    setRoleModalOpen(true);
  };

  // NOTE: role changes are still local-state only (both modes). The
  // server-enforced reference mutation is suspend/activate below; role
  // changes should follow the same API-route pattern before they are
  // relied on in production (see STAGE2B_REPORT.md).
  const handleConfirmRoleChange = () => {
    if (!targetUser) return;
    setUsers((prev) =>
      prev.map((u) =>
        u.id === targetUser.id ? { ...u, role: selectedNewRole } : u
      )
    );
    setRoleModalOpen(false);
  };

  // Suspend / activate — the reference admin mutation. In Supabase mode it
  // goes through POST /api/admin/users/status, which re-verifies the
  // caller's admin role server-side and writes an audit_logs entry; in
  // demo mode it updates only the browser's demo store.
  const handleToggleSuspend = async (user: AdminUser) => {
    const nextStatus = user.status === "active" ? "suspended" : "active";
    setActionError(null);
    try {
      const updated = await adminRepo.setUserStatus(user.id, nextStatus);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to change the user's status."
      );
    }
  };

  const handleDeleteUser = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  return (
    <div className="space-y-6 pb-14">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            User Management
          </h1>
          <span className="demo-badge">Admin Controls</span>
          {isDemo && <span className="demo-badge">Demo Data</span>}
        </div>
        <p className="mt-1 text-14 text-black-300">
          Manage platform roles, tenant ownership, and security suspensions.
        </p>
        {isDemo ? (
          <p className="mt-1 text-12 text-orange-300/90">
            Demo mode: this user list is sample data stored in your browser;
            suspend/activate changes nothing on any server.
          </p>
        ) : (
          <p className="mt-1 text-12 text-black-400">
            Suspend/activate is enforced server-side. Role changes and user
            deletion are not yet wired to the server (see project report).
          </p>
        )}
      </div>

      {(loadError || actionError) && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 px-5 py-3 text-13 text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{loadError ?? actionError}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="glass-card p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-black-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="input-field pl-10 py-2.5 text-13"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-12 text-black-400 font-medium whitespace-nowrap">
            Role:
          </span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl border border-black-600 bg-black-800 px-3 py-2 text-13 text-white focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-13 border-collapse">
            <thead>
              <tr className="border-b border-black-700/80 bg-black-800/40 text-11 font-semibold uppercase tracking-wider text-black-400">
                <th className="py-3.5 px-5">User</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Plan Tier</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Joined Date</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black-700/50">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-black-400">
                    Loading users…
                  </td>
                </tr>
              )}
              {filteredUsers.map((u) => {
                const initials = u.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .toUpperCase();

                return (
                  <tr key={u.id} className="table-row-hover">
                    {/* Avatar + Name + Email */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-600/20 text-purple-300 text-12 font-bold border border-purple-500/30">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-white block truncate">
                            {u.name}
                          </span>
                          <span className="text-11 text-black-400 block truncate">
                            {u.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Role Dropdown / Badge */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <select
                        value={u.role}
                        onChange={(e) =>
                          handleOpenRoleModal(u, e.target.value as UserRole)
                        }
                        className="rounded-lg border border-black-700 bg-black-800 px-2 py-1 text-12 font-semibold text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    </td>

                    {/* Plan */}
                    <td className="py-4 px-4 uppercase text-12 font-medium text-black-200">
                      {u.plan}
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      {u.status === "suspended" ? (
                        <Badge variant="red">Suspended</Badge>
                      ) : (
                        <Badge variant="green">Active</Badge>
                      )}
                    </td>

                    {/* Joined Date */}
                    <td className="py-4 px-4 text-12 text-black-400 whitespace-nowrap">
                      {formatDate(u.created_at, "short")}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setViewingUser(u);
                            setProfileModalOpen(true);
                          }}
                          className="rounded-lg bg-black-800 hover:bg-black-700 px-2.5 py-1 text-11 text-black-300 hover:text-white"
                        >
                          View Profile
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleToggleSuspend(u)}
                          className={`rounded-lg px-2.5 py-1 text-11 font-medium transition-colors ${
                            u.status === "suspended"
                              ? "bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/50"
                              : "bg-amber-950/40 text-amber-300 hover:bg-amber-900/50"
                          }`}
                        >
                          {u.status === "suspended" ? "Unsuspend" : "Suspend"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u.id)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-rose-400 hover:bg-rose-950/30"
                          title="Delete User"
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

      {/* CONFIRM ROLE CHANGE MODAL */}
      <Modal
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title="Confirm Role Change"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-rose-200">
            <Shield className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
            <div className="text-13 space-y-1">
              <p className="font-semibold text-white">
                Modify Platform Privileges
              </p>
              <p className="leading-relaxed">
                Are you sure you want to grant{" "}
                <strong className="text-white uppercase font-bold">
                  [{selectedNewRole}]
                </strong>{" "}
                role to{" "}
                <strong className="text-white">
                  {targetUser?.name} ({targetUser?.email})
                </strong>
                ?
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-black-700">
            <button
              type="button"
              onClick={() => setRoleModalOpen(false)}
              className="rounded-xl bg-black-800 hover:bg-black-700 px-4 py-2 text-13 font-medium text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmRoleChange}
              className="rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2 text-13 font-semibold text-white shadow-glow-orange"
            >
              Confirm Role Change
            </button>
          </div>
        </div>
      </Modal>

      {/* VIEW PROFILE MODAL */}
      <Modal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="User Profile Details"
      >
        {viewingUser && (
          <div className="space-y-4 text-13">
            <div className="flex items-center gap-3 pb-3 border-b border-black-700">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 to-orange-500 text-white font-bold text-16">
                {viewingUser.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h4 className="font-bold text-white text-16">{viewingUser.name}</h4>
                <p className="text-black-400 text-12">{viewingUser.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-12">
              <div className="rounded-xl bg-black-800/80 p-3 border border-black-700">
                <span className="text-black-400 block">User Role</span>
                <span className="text-white font-semibold uppercase mt-0.5 block">
                  {viewingUser.role}
                </span>
              </div>
              <div className="rounded-xl bg-black-800/80 p-3 border border-black-700">
                <span className="text-black-400 block">Subscription Tier</span>
                <span className="text-white font-semibold uppercase mt-0.5 block">
                  {viewingUser.plan}
                </span>
              </div>
              <div className="rounded-xl bg-black-800/80 p-3 border border-black-700">
                <span className="text-black-400 block">Status</span>
                <span className="text-white font-semibold capitalize mt-0.5 block">
                  {viewingUser.status}
                </span>
              </div>
              <div className="rounded-xl bg-black-800/80 p-3 border border-black-700">
                <span className="text-black-400 block">Owned Workspaces</span>
                <span className="text-white font-semibold mt-0.5 block">
                  {viewingUser.workspace_count}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-black-700">
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
