import { z } from "zod";
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

interface ProposalAction<A = unknown> {
  requiresExec: boolean;
  schema: z.ZodType<A>;
  preview(args: A): string;
  execute(args: A, ctx: { userId: string }): Promise<void>;
}

const createExecTodoSchema = z.object({
  title: z.string().trim().min(1).max(200),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** Registry of everything the assistant may do on a user's behalf. Pieces 3/4 add entries here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PROPOSAL_ACTIONS: Record<string, ProposalAction<any>> = {
  create_exec_todo: {
    requiresExec: true,
    schema: createExecTodoSchema,
    preview: (a: z.infer<typeof createExecTodoSchema>) =>
      `Add exec to-do: "${a.title}"${a.due_date ? ` (due ${a.due_date})` : ""}`,
    // Real execution is wired in tools/write-tools.ts (user-scoped Supabase insert); replaced in tests.
    execute: async () => {
      throw new Error("create_exec_todo executor not registered");
    },
  },
};

export async function createProposal(
  store: ProposalStore,
  actor: Actor,
  threadId: string | null,
  toolName: string,
  rawArgs: unknown,
): Promise<{ ok: true; proposalId: string; preview: string } | { ok: false; error: string }> {
  const action = PROPOSAL_ACTIONS[toolName];
  if (!action) return { ok: false, error: "That action isn't available." };
  if (action.requiresExec && !isExec(actor.role)) return { ok: false, error: "Only execs can do that." };
  const parsed = action.schema.safeParse(rawArgs);
  if (!parsed.success) return { ok: false, error: "Those details aren't valid." };
  const preview = action.preview(parsed.data);
  const { id } = await store.insert({ userId: actor.id, threadId, tool: toolName, args: parsed.data, preview });
  return { ok: true, proposalId: id, preview };
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
    return { ok: false, error: "That didn't work. Nothing was changed." };
  }
  await store.markExecuted(id, now.toISOString());
  return { ok: true };
}

export async function rejectProposal(store: ProposalStore, actor: Actor, id: string): Promise<{ ok: boolean }> {
  return { ok: await store.reject(id, actor.id) };
}
