import "server-only";
import type { UIMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { titleFromText } from "./context";

export function supabaseThreadStore(supabase: SupabaseClient<Database>, userId: string) {
  return {
    async ensure(threadId: string | null, firstText: string): Promise<string> {
      if (threadId) {
        // RLS makes a foreign id invisible; fall through to creating a fresh thread.
        const { data } = await supabase.from("chat_threads").select("id").eq("id", threadId).maybeSingle();
        if (data) return data.id;
      }
      const { data, error } = await supabase
        .from("chat_threads")
        .insert({ user_id: userId, title: titleFromText(firstText) })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    async save(threadId: string, messages: UIMessage[]): Promise<void> {
      // Replace-all keeps the stored thread identical to what the client shows. Threads are small (history is windowed).
      await supabase.from("chat_messages").delete().eq("thread_id", threadId);
      if (messages.length > 0) {
        const { error } = await supabase
          .from("chat_messages")
          .insert(messages.map((m) => ({ thread_id: threadId, role: m.role, parts: m.parts })));
        if (error) throw error;
      }
      await supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    },
  };
}
