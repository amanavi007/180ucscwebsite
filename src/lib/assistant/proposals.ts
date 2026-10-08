import { ACTIONS } from "./proposal-actions";
import { ADMIN_ACTIONS } from "./proposal-actions-admin";
import { isExec } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/supabase/database.types";

export interface ProposalStore {
  insert(p: { userId: string; threadId: string | null; tool: string; args: unknown; preview: string }): Promise<{ id: string }>;
  claim(id: string, userId: string, nowIso: string): Promise<{ id: string; tool: string; args: unknown } | null>;
  markExecuted(id: string, nowIso: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  reject(id: string, userId: string): Promise<boolean>;
}

export interface Actor { id: string; role: UserRole }

/** Thrown by executors when the underlying action refused (permissions, validation): the message is safe to show. */
export class UserFacingError extends Error {}

export const PROPOSAL_ACTIONS = { ...ACTIONS, ...ADMIN_ACTIONS };

export async function createProposal(
  store: ProposalStore,
  actor: Actor,
  threadId: string | null,
  toolName: string,
  rawArgs: unknown,
): Promise<{ ok: true; proposalId: string; preview: string; warning?: string } | { ok: false; error: string }> {
  const action = PROPOSAL_ACTIONS[toolName];
  if (!action) return { ok: false, error: "That action isn't available." };
  if (action.requiresExec && !isExec(actor.role)) return { ok: false, error: "Only execs can do that." };
  const parsed = action.schema.safeParse(rawArgs);
  if (!parsed.success) return { ok: false, error: "Those details aren't valid." };
  const preview = action.preview(parsed.data);
  const { id } = await store.insert({ userId: actor.id, threadId, tool: toolName, args: parsed.data, preview });
  return { ok: true, proposalId: id, preview, ...(action.warning ? { warning: action.warning } : {}) };
}

export async function approveProposal(
  store: ProposalStore,
  actor: Actor,
  id: string,
  now: Date,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const claimed = await store.claim(id, actor.id, now.toISOString());
  if (!claimed) return { ok: false, error: "This proposal is no longer available (expired, already handled, or not yours)." };

  const action = PROPOSAL_ACTIONS[claimed.tool];
  if (!action) {
    await store.markFailed(id, "unknown action");
    return { ok: false, error: "That action isn't available." };
  }
  if (action.requiresExec && !isExec(actor.role)) {
    await store.markFailed(id, "no longer permitted");
    return { ok: false, error: "You no longer have permission to do that." };
  }
  const parsed = action.schema.safeParse(claimed.args);
  if (!parsed.success) {
    await store.markFailed(id, "invalid stored args");
    return { ok: false, error: "Those details aren't valid." };
  }
  try {
    await action.execute(parsed.data, { userId: actor.id });
  } catch (err) {
    await store.markFailed(id, err instanceof Error ? err.message : "execution failed");
    return { ok: false, error: err instanceof UserFacingError ? err.message : "That didn't work. Nothing was changed." };
  }
  await store.markExecuted(id, now.toISOString());
  return { ok: true };
}

export async function rejectProposal(store: ProposalStore, actor: Actor, id: string): Promise<{ ok: boolean }> {
  return { ok: await store.reject(id, actor.id) };
}
