import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { PROPOSAL_ACTIONS, createProposal, type Actor, type ProposalStore } from "../proposals";

/** User-scoped store: RLS (chat_proposals_own) guarantees ownership; the filters are belt and braces. */
export async function supabaseProposalStore(): Promise<ProposalStore> {
  const supabase = await createClient();
  return {
    insert: async (p) => {
      const { data, error } = await supabase
        .from("chat_proposals")
        .insert({ user_id: p.userId, thread_id: p.threadId, tool: p.tool, args: p.args, preview: p.preview })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id };
    },
    claim: async (id, userId, nowIso) => {
      const { data } = await supabase
        .from("chat_proposals")
        .update({ status: "approved" })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "pending")
        .gt("expires_at", nowIso)
        .select("id, tool, args")
        .maybeSingle();
      return data ?? null;
    },
    markExecuted: async (id, nowIso) => {
      await supabase.from("chat_proposals").update({ status: "executed", executed_at: nowIso }).eq("id", id);
    },
    markFailed: async (id, error) => {
      await supabase.from("chat_proposals").update({ status: "failed", error }).eq("id", id);
    },
    reject: async (id, userId) => {
      const { data } = await supabase
        .from("chat_proposals")
        .update({ status: "rejected" })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      return !!data;
    },
  };
}

/** Wire the real executors. Called at module load of the approve route and chat route. */
export function registerExecutors() {
  PROPOSAL_ACTIONS.create_exec_todo.execute = async (args: { title: string; due_date?: string | null }, ctx) => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("exec_todos")
      .insert({ title: args.title, due_date: args.due_date ?? null, created_by: ctx.userId });
    if (error) throw error;
    await logAudit(ctx.userId, "assistant.create_exec_todo", args.title, "Created via AI assistant (approved)");
  };
}

export function buildWriteTools(actor: Actor, threadId: string | null, store: ProposalStore): ToolSet {
  return {
    propose_exec_todo: tool({
      description:
        "Propose adding an item to the exec to-do list. This does NOT add it: the user must approve a card first. Exec only.",
      inputSchema: z.object({
        title: z.string().describe("Short to-do title"),
        due_date: z.string().nullable().optional().describe("YYYY-MM-DD, if the user gave a date"),
      }),
      execute: async (args) => {
        const r = await createProposal(store, actor, threadId, "create_exec_todo", args);
        return r.ok
          ? { status: "awaiting_user_approval", proposalId: r.proposalId, preview: r.preview }
          : { status: "refused", reason: r.error };
      },
    }),
  };
}
