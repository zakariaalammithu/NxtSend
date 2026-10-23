/**
 * Support permission matrix (P10 Stage E) — pure, unit-tested.
 *
 * Roles in this app are only super_admin / admin / user (migration
 * 001). "Sub-Admin" from the brief = an `admin` profile that ALSO has
 * an enabled row in support_agents; eligibility is a separate
 * server-checked record so an admin login alone never silently
 * grants customer-chat access.
 *
 *   super_admin                     -> everything, incl. settings
 *                                      writes and assigning to others
 *   admin + enabled agent row       -> inbox, reply, claim (unassigned
 *                                      -> self), KB + saved-reply
 *                                      writes, preview, own availability
 *   admin WITHOUT an enabled row    -> nothing in support (403)
 *   user                            -> nothing in support (403)
 *
 * Conversation scoping on top of this matrix (canActOnConversation):
 * an agent may reply to / change status of conversations that are
 * unassigned or assigned to them; a super_admin may act on any.
 * Viewing a thread and adding internal notes are team-wide for
 * enabled agents.
 */

import type { SupportConversation } from "./types";

export type SupportRole = "super_admin" | "admin" | "user";

export interface SupportActor {
  profileId: string | null;
  email: string;
  /** Snapshot used as sender_display_name on this actor's replies. */
  displayName: string;
  role: SupportRole;
  /** Enabled support_agents row (always true for the demo persona). */
  agentEnabled: boolean;
  /** Sender type stamped on this actor's replies (audit §E.2 mapping). */
  senderType: "admin" | "agent";
}

export interface SupportPermissions {
  canAccessSupport: boolean;
  canViewInbox: boolean;
  canReply: boolean;
  canNote: boolean;
  canClaim: boolean;
  canAssignOthers: boolean;
  canChangeStatus: boolean;
  canManageKnowledge: boolean;
  canManageSavedReplies: boolean;
  canPreview: boolean;
  canManageSettings: boolean;
  canViewAgents: boolean;
  canManageAgents: boolean;
  canSetOwnAvailability: boolean;
}

const NONE: SupportPermissions = {
  canAccessSupport: false,
  canViewInbox: false,
  canReply: false,
  canNote: false,
  canClaim: false,
  canAssignOthers: false,
  canChangeStatus: false,
  canManageKnowledge: false,
  canManageSavedReplies: false,
  canPreview: false,
  canManageSettings: false,
  canViewAgents: false,
  canManageAgents: false,
  canSetOwnAvailability: false,
};

export function supportPermissions(
  role: SupportRole,
  agentEnabled: boolean
): SupportPermissions {
  if (role === "super_admin") {
    return {
      canAccessSupport: true,
      canViewInbox: true,
      canReply: true,
      canNote: true,
      canClaim: true,
      canAssignOthers: true,
      canChangeStatus: true,
      canManageKnowledge: true,
      canManageSavedReplies: true,
      canPreview: true,
      canManageSettings: true,
      canViewAgents: true,
      canManageAgents: true,
      canSetOwnAvailability: true,
    };
  }
  if (role === "admin" && agentEnabled) {
    return {
      ...NONE,
      canAccessSupport: true,
      canViewInbox: true,
      canReply: true,
      canNote: true,
      canClaim: true,
      canChangeStatus: true,
      canManageKnowledge: true,
      canManageSavedReplies: true,
      canPreview: true,
      canViewAgents: true,
      canSetOwnAvailability: true,
      // canAssignOthers / canManageSettings / canManageAgents stay false.
    };
  }
  return NONE;
}

/**
 * May this actor reply to / change the status of this conversation?
 * Super admins: any. Enabled agents: unassigned or their own.
 */
export function canActOnConversation(
  actor: SupportActor,
  permissions: SupportPermissions,
  conversation: SupportConversation
): boolean {
  if (!permissions.canViewInbox) return false;
  if (actor.role === "super_admin") return true;
  return conversation.assignee_id === null || conversation.assignee_id === actor.profileId;
}
