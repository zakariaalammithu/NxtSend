/**
 * Admin repository (client-side).
 *
 * - Demo backend: the bundled MOCK_ADMIN_USERS dataset, persisted through
 *   the localStorage demo store so suspend/activate behaves like a real
 *   product inside the browser. Clearly demo data; mutations never leave
 *   the browser.
 * - Supabase backend: talks to the /api/admin/* route handlers. Those
 *   routes verify the caller's profile role on the SERVER (admin or
 *   super_admin) before reading with the service-role client or mutating
 *   anything — the browser client alone could never list all profiles,
 *   because RLS (correctly) restricts profiles to the owner.
 */

import type { PlanType, UserRole } from "@/types";
import { MOCK_ADMIN_SUBSCRIPTIONS, MOCK_ADMIN_USERS } from "@/lib/db/mock/data";
import { getDataMode, type DataMode } from "./mode";
import { loadDemoCollection, saveDemoCollection } from "./demo-store";

const DEMO_ADMIN_USERS_KEY = "nxtsend_demo_admin_users_v1";

export type AdminUserStatus = "active" | "suspended";

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  plan: PlanType;
  status: AdminUserStatus;
  created_at: string;
  workspace_count: number;
}

export interface AdminOverview {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalWorkspaces: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  recentUsers: AdminUserRecord[];
}

export interface AdminRepository {
  readonly mode: DataMode;
  listUsers(): Promise<AdminUserRecord[]>;
  getOverview(): Promise<AdminOverview>;
  /**
   * Suspend/activate — the reference admin mutation. In Supabase mode this
   * goes through POST /api/admin/users/status, which re-verifies the
   * caller's admin role server-side and writes an audit_logs entry.
   */
  setUserStatus(userId: string, status: AdminUserStatus): Promise<AdminUserRecord>;
}

// ============================================================================
// Demo backend
// ============================================================================

function seedAdminUsers(): AdminUserRecord[] {
  return MOCK_ADMIN_USERS.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    plan: u.plan,
    status: u.status,
    created_at: u.created_at,
    workspace_count: u.workspace_count,
  }));
}

class DemoAdminRepository implements AdminRepository {
  readonly mode: DataMode = "demo";

  private load(): AdminUserRecord[] {
    return loadDemoCollection<AdminUserRecord>(DEMO_ADMIN_USERS_KEY, seedAdminUsers);
  }

  async listUsers(): Promise<AdminUserRecord[]> {
    return this.load();
  }

  async getOverview(): Promise<AdminOverview> {
    const users = this.load();
    return {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.status === "active").length,
      suspendedUsers: users.filter((u) => u.status === "suspended").length,
      totalWorkspaces: users.reduce((sum, u) => sum + u.workspace_count, 0),
      totalSubscriptions: MOCK_ADMIN_SUBSCRIPTIONS.length,
      activeSubscriptions: MOCK_ADMIN_SUBSCRIPTIONS.filter(
        (s) => s.status === "active"
      ).length,
      recentUsers: [...users]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 5),
    };
  }

  async setUserStatus(
    userId: string,
    status: AdminUserStatus
  ): Promise<AdminUserRecord> {
    const users = this.load();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx < 0) throw new Error(`User not found: ${userId}`);
    const updated = { ...users[idx], status };
    users[idx] = updated;
    saveDemoCollection(DEMO_ADMIN_USERS_KEY, users);
    return updated;
  }
}

// ============================================================================
// Supabase backend (via role-checked API routes)
// ============================================================================

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Request failed (${res.status})`
    );
  }
  return body as T;
}

class SupabaseAdminRepository implements AdminRepository {
  readonly mode: DataMode = "supabase";

  async listUsers(): Promise<AdminUserRecord[]> {
    const body = await fetchJson<{ users: AdminUserRecord[] }>("/api/admin/users");
    return body.users;
  }

  async getOverview(): Promise<AdminOverview> {
    return fetchJson<AdminOverview>("/api/admin/overview");
  }

  async setUserStatus(
    userId: string,
    status: AdminUserStatus
  ): Promise<AdminUserRecord> {
    const body = await fetchJson<{ user: AdminUserRecord }>(
      "/api/admin/users/status",
      {
        method: "POST",
        body: JSON.stringify({ userId, status }),
      }
    );
    return body.user;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAdminRepository(mode: DataMode = getDataMode()): AdminRepository {
  return mode === "supabase" ? new SupabaseAdminRepository() : new DemoAdminRepository();
}
