import "server-only";
import { createClient } from "@/lib/supabase/server";

/** This quarter's configured meeting days, sorted ascending -- the source of truth (not the Tue/Thu rule). */
export async function getMeetingDatesForQuarter(quarterId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meeting_dates")
    .select("date")
    .eq("quarter_id", quarterId)
    .order("date", { ascending: true });
  if (error) throw error;
  return data.map((d) => d.date);
}
