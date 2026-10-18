"use client";

import * as React from "react";
import { User, Lock, Bell, Users, AlertTriangle, Check, Plus, Trash2 } from "lucide-react";
import { DemoBanner, Badge, Modal } from "@/components/ui";

interface Member {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  avatar: string;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState<
    "profile" | "password" | "notifications" | "team" | "danger"
  >("profile");

  // Profile Form State
  const [fullName, setFullName] = React.useState("Alex Vance");
  const [email] = React.useState("alex@nxtsend.com");
  const [bio, setBio] = React.useState(
    "Head of Growth. Building multichannel outreach machines."
  );
  const [profileSaved, setProfileSaved] = React.useState(false);

  // Password Form State
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordSaved, setPasswordSaved] = React.useState(false);

  // Notifications State
  const [emailReplies, setEmailReplies] = React.useState(true);
  const [linkedinConnects, setLinkedinConnects] = React.useState(true);
  const [dailyDigest, setDailyDigest] = React.useState(false);
  const [bounceAlerts, setBounceAlerts] = React.useState(true);

  // Team Members
  const [members, setMembers] = React.useState<Member[]>([
    {
      id: "mem_1",
      name: "Alex Vance",
      email: "alex@nxtsend.com",
      role: "owner",
      avatar: "AV",
    },
    {
      id: "mem_2",
      name: "Sarah Jenkins",
      email: "sarah.j@stripe.com",
      role: "admin",
      avatar: "SJ",
    },
    {
      id: "mem_3",
      name: "David Zhao",
      email: "david.zhao@datadoghq.com",
      role: "member",
      avatar: "DZ",
    },
  ]);

  // Invite Modal
  const [inviteModalOpen, setInviteModalOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"admin" | "member">("member");

  // Danger Modal
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSaved(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setPasswordSaved(false), 2500);
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    const newMem: Member = {
      id: `mem_${Date.now()}`,
      name: inviteEmail.split("@")[0],
      email: inviteEmail,
      role: inviteRole,
      avatar: inviteEmail.slice(0, 2).toUpperCase(),
    };

    setMembers([...members, newMem]);
    setInviteEmail("");
    setInviteModalOpen(false);
  };

  const handleRemoveMember = (id: string) => {
    setMembers(members.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-7 pb-14 max-w-4xl">
      <DemoBanner feature="Workspace Settings" />

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-24 sm:text-28 font-bold tracking-tight text-white">
            Workspace Settings
          </h1>
          <span className="demo-badge">Demo Mode</span>
        </div>
        <p className="mt-1 text-14 text-black-300">
          Manage your personal profile, credentials, notifications, and team permissions.
        </p>
      </div>

      {/* Settings Tabs Navigation */}
      <div className="flex items-center gap-1 border-b border-black-700/80 pb-px overflow-x-auto scrollbar-hide">
        {[
          { key: "profile", label: "Profile", icon: User },
          { key: "password", label: "Password", icon: Lock },
          { key: "notifications", label: "Notifications", icon: Bell },
          { key: "team", label: "Team Members", icon: Users },
          { key: "danger", label: "Danger Zone", icon: AlertTriangle },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() =>
                setActiveTab(
                  tab.key as "profile" | "password" | "notifications" | "team" | "danger"
                )
              }
              className={`flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-13 font-medium transition-colors border-b-2 whitespace-nowrap ${
                isActive
                  ? tab.key === "danger"
                    ? "border-rose-500 text-rose-400 bg-rose-950/20"
                    : "border-purple-500 text-white bg-black-800/40"
                  : "border-transparent text-black-400 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Profile */}
      {activeTab === "profile" && (
        <form onSubmit={handleSaveProfile} className="glass-card p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 to-orange-500 text-white text-20 font-bold shadow-glow-purple">
              AV
            </div>
            <div>
              <h3 className="text-16 font-semibold text-white">Profile Picture</h3>
              <p className="text-12 text-black-400 mt-0.5">Avatar initials derived from your full name</p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-13 font-medium text-black-200 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-13 font-medium text-black-200 mb-1.5">
                Email Address (Read-only)
              </label>
              <input
                type="email"
                disabled
                value={email}
                className="input-field opacity-60 cursor-not-allowed bg-black-900"
              />
            </div>

            <div>
              <label className="block text-13 font-medium text-black-200 mb-1.5">
                Bio / Title
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="input-field resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-black-700">
            {profileSaved && (
              <span className="flex items-center gap-1.5 text-13 text-emerald-400 font-medium">
                <Check className="h-4 w-4" />
                <span>Profile saved successfully!</span>
              </span>
            )}
            <div className="ml-auto">
              <button
                type="submit"
                className="rounded-xl bg-purple-600 hover:bg-purple-500 px-6 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: Password */}
      {activeTab === "password" && (
        <form onSubmit={handleSavePassword} className="glass-card p-6 sm:p-8 space-y-6">
          <div>
            <h3 className="text-16 font-semibold text-white">Change Password</h3>
            <p className="text-13 text-black-300 mt-0.5">
              Ensure your account is protected with a strong passphrase.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-13 font-medium text-black-200 mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-13 font-medium text-black-200 mb-1.5">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-13 font-medium text-black-200 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                className="input-field"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-black-700">
            {passwordSaved && (
              <span className="flex items-center gap-1.5 text-13 text-emerald-400 font-medium">
                <Check className="h-4 w-4" />
                <span>Password updated!</span>
              </span>
            )}
            <div className="ml-auto">
              <button
                type="submit"
                className="rounded-xl bg-purple-600 hover:bg-purple-500 px-6 py-2.5 text-14 font-semibold text-white shadow-glow-purple transition-all"
              >
                Update Password
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: Notifications */}
      {activeTab === "notifications" && (
        <div className="glass-card p-6 sm:p-8 space-y-6">
          <div>
            <h3 className="text-16 font-semibold text-white">
              Notification Preferences
            </h3>
            <p className="text-13 text-black-300 mt-0.5">
              Choose which alerts you want delivered to your email inbox.
            </p>
          </div>

          <div className="divide-y divide-black-700/60">
            <div className="py-4 flex items-center justify-between">
              <div>
                <p className="text-14 font-medium text-white">Prospect Replies</p>
                <p className="text-12 text-black-400">
                  Receive instant alerts whenever a prospect responds to an outreach touch.
                </p>
              </div>
              <input
                type="checkbox"
                checked={emailReplies}
                onChange={(e) => setEmailReplies(e.target.checked)}
                className="h-5 w-5 rounded border-black-600 bg-black-800 text-purple-600"
              />
            </div>

            <div className="py-4 flex items-center justify-between">
              <div>
                <p className="text-14 font-medium text-white">
                  LinkedIn Connection Accepted
                </p>
                <p className="text-12 text-black-400">
                  Notify me when a high-priority contact accepts my connection request.
                </p>
              </div>
              <input
                type="checkbox"
                checked={linkedinConnects}
                onChange={(e) => setLinkedinConnects(e.target.checked)}
                className="h-5 w-5 rounded border-black-600 bg-black-800 text-purple-600"
              />
            </div>

            <div className="py-4 flex items-center justify-between">
              <div>
                <p className="text-14 font-medium text-white">Daily Digest</p>
                <p className="text-12 text-black-400">
                  Summary email of newly scheduled sequence touches and reply metrics.
                </p>
              </div>
              <input
                type="checkbox"
                checked={dailyDigest}
                onChange={(e) => setDailyDigest(e.target.checked)}
                className="h-5 w-5 rounded border-black-600 bg-black-800 text-purple-600"
              />
            </div>

            <div className="py-4 flex items-center justify-between">
              <div>
                <p className="text-14 font-medium text-white">Bounce & Spam Alerts</p>
                <p className="text-12 text-black-400">
                  Immediate alert if domain bounce rate exceeds recommended safety margin.
                </p>
              </div>
              <input
                type="checkbox"
                checked={bounceAlerts}
                onChange={(e) => setBounceAlerts(e.target.checked)}
                className="h-5 w-5 rounded border-black-600 bg-black-800 text-purple-600"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Team */}
      {activeTab === "team" && (
        <div className="glass-card p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-16 font-semibold text-white">
                Workspace Members
              </h3>
              <p className="text-13 text-black-300 mt-0.5">
                Invite teammates to collaborate on sequences and leads.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setInviteModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2 text-13 font-semibold text-white shadow-glow-purple transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>Invite Teammate</span>
            </button>
          </div>

          <div className="divide-y divide-black-700/60 pt-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="py-3.5 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-600/20 text-purple-300 text-12 font-bold border border-purple-500/30">
                    {m.avatar}
                  </div>
                  <div>
                    <p className="text-14 font-semibold text-white">{m.name}</p>
                    <p className="text-12 text-black-400">{m.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant={m.role === "owner" ? "purple" : "blue"}>
                    {m.role.toUpperCase()}
                  </Badge>

                  {m.role !== "owner" && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.id)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-rose-400 hover:bg-rose-950/30"
                      title="Remove member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* INVITE MODAL */}
          <Modal
            isOpen={inviteModalOpen}
            onClose={() => setInviteModalOpen(false)}
            title="Invite Teammate"
          >
            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-12 text-black-300 mb-1">
                  Teammate Work Email
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="input-field py-2 text-13"
                />
              </div>

              <div>
                <label className="block text-12 text-black-300 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                  className="w-full rounded-xl border border-black-600 bg-black-800 px-4 py-2.5 text-13 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="member">Member (Can create & manage sequences)</option>
                  <option value="admin">Admin (Can manage billing & integrations)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-black-700">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="rounded-xl bg-black-800 hover:bg-black-700 px-4 py-2 text-13 font-medium text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-2 text-13 font-semibold text-white shadow-glow-purple"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* TAB 5: Danger Zone */}
      {activeTab === "danger" && (
        <div className="glass-card p-6 sm:p-8 space-y-6 border border-rose-500/30">
          <div>
            <h3 className="text-18 font-bold text-rose-400">Danger Zone</h3>
            <p className="text-13 text-black-300 mt-1">
              Irreversible actions that affect your entire workspace and team.
            </p>
          </div>

          <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="font-semibold text-white text-14">
                Delete this workspace
              </p>
              <p className="text-12 text-rose-300/80 mt-0.5">
                Permanently delete all campaigns, lead contact data, and active sequences.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2.5 text-13 font-semibold text-white transition-colors self-start sm:self-auto shrink-0"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete Workspace</span>
            </button>
          </div>

          {/* DELETE CONFIRMATION MODAL */}
          <Modal
            isOpen={deleteModalOpen}
            onClose={() => setDeleteModalOpen(false)}
            title="Confirm Workspace Deletion"
          >
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-rose-200">
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                <div className="text-13 space-y-1">
                  <p className="font-semibold text-white">
                    Are you absolutely sure?
                  </p>
                  <p className="leading-relaxed">
                    This action cannot be undone. In demo mode, this will simulate deleting Alex Vance&apos;s Workspace.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-black-700">
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  className="rounded-xl bg-black-800 hover:bg-black-700 px-4 py-2 text-13 font-medium text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  className="rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2 text-13 font-semibold text-white"
                >
                  Permanently Delete
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}
