"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { getSessionForDate, type SessionWithMarks } from "@/lib/data/attendance";
import { isExec } from "@/lib/auth/roles";
import { isProjectLead } from "@/lib/auth/project-access";
import type { AttendanceMark } from "@/lib/supabase/database.types";

export interface ActionResult {
  error?: string;
}

async function requireAttendanceAccess(projectId: string) {
  const profile = await getCurrentProfile();
  const leads = await isProjectLead(projectId, profile.id, isExec(profile.role));

  if (!leads) {
    return { error: "Only your project's lead or exec can submit attendance.", profile } as const;
  }
  return { error: undefined, profile } as const;
}

export async function submitAttendance(input: {
  projectId: string;
  date: string;
  excusedIds: string[];
  unexcusedIds: string[];
  tardyIds: string[];
}): Promise<ActionResult> {
  const denied = await requireAttendanceAccess(input.projectId);
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();

  const { data: session, error: sessionError } = await supabase
    .from("attendance_sessions")
    .upsert(
      { project_id: input.projectId, date: input.date, taken_by: denied.profile.id },
      { onConflict: "project_id,date" },
    )
    .select("id")
    .single();

  if (sessionError) return { error: sessionError.message };

  const { error: deleteError } = await supabase
    .from("attendance_marks")
    .delete()
    .eq("session_id", session.id);
  if (deleteError) return { error: deleteError.message };

  const rows: { session_id: string; user_id: string; mark: AttendanceMark }[] = [
    ...input.excusedIds.map((user_id) => ({ session_id: session.id, user_id, mark: "excused" as const })),
    ...input.unexcusedIds.map((user_id) => ({
      session_id: session.id,
      user_id,
      mark: "unexcused" as const,
    })),
    ...input.tardyIds.map((user_id) => ({ session_id: session.id, user_id, mark: "tardy" as const })),
  ];

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("attendance_marks").insert(rows);
    if (insertError) return { error: insertError.message };
  }

  revalidatePath("/portal/attendance");
  revalidatePath(`/portal/projects/${input.projectId}`);
  return {};
}

export async function fetchSessionForDate(
  projectId: string,
  date: string,
): Promise<SessionWithMarks | null> {
  return getSessionForDate(projectId, date);
}
