import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ExecTodo {
  id: string;
  title: string;
  due_date: string | null;
  status: "open" | "done";
  assigned_to: string[];
}

export async function getExecTodos(): Promise<ExecTodo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exec_todos")
    .select("id, title, due_date, status, assigned_to")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data;
}
