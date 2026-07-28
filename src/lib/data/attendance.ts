import "server-only";
import { createClient } from "@/lib/supabase/server";
import { computeAttendanceRate, type AttendanceRateResult } from "@/lib/attendance";
import type { AttendanceMark } from "@/lib/supabase/database.types";

/** Distinct session dates logged org-wide for a quarter -- the shared rate denominator. */
export async function getQuarterSessionDates(quarterId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select("date, project:projects!inner(quarter_id)")
    .eq("project.quarter_id", quarterId);

  if (error) throw error;
  return [...new Set((data as unknown as { date: string }[]).map((d) => d.date))].sort();
}

/** Distinct session dates a specific team has logged this quarter. */
export async function getProjectSessionDates(projectId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select("date")
    .eq("project_id", projectId);

  if (error) throw error;
  return [...new Set(data.map((d) => d.date))].sort();
}

export interface SessionWithMarks {
  id: string;
  date: string;
  taken_by: string;
  marks: { user_id: string; mark: AttendanceMark }[];
}

export async function getSessionForDate(
  projectId: string,
  date: string,
): Promise<SessionWithMarks | null> {
  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from("attendance_sessions")
    .select("id, date, taken_by")
    .eq("project_id", projectId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  if (!session) return null;

  const { data: marks, error: marksError } = await supabase
    .from("attendance_marks")
    .select("user_id, mark")
    .eq("session_id", session.id);

  if (marksError) throw marksError;
  return { ...session, marks };
}

export interface AttendanceHistoryRow {
  id: string;
  date: string;
  taken_by_name: string;
  excused: number;
  unexcused: number;
  tardy: number;
}

export async function getAttendanceHistory(projectId: string): Promise<AttendanceHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select("id, date, taken_by:profiles(name), marks:attendance_marks(mark)")
    .eq("project_id", projectId)
    .order("date", { ascending: false });

  if (error) throw error;

  return (
    data as unknown as {
      id: string;
      date: string;
      taken_by: { name: string } | null;
      marks: { mark: AttendanceMark }[];
    }[]
  ).map((s) => ({
    id: s.id,
    date: s.date,
    taken_by_name: s.taken_by?.name ?? "Unknown",
    excused: s.marks.filter((m) => m.mark === "excused").length,
    unexcused: s.marks.filter((m) => m.mark === "unexcused").length,
    tardy: s.marks.filter((m) => m.mark === "tardy").length,
  }));
}

/** Per-member attendance rate for a quarter, keyed by user_id. Exec-only view. */
export async function getQuarterAttendanceRates(
  quarterId: string,
  rows: { user_id: string; project_id: string | null }[],
): Promise<Record<string, AttendanceRateResult>> {
  const totalSessionDates = await getQuarterSessionDates(quarterId);
  const teamDatesCache = new Map<string, string[]>();
  const rates: Record<string, AttendanceRateResult> = {};

  for (const row of rows) {
    let teamSessionDates: string[] = [];
    if (row.project_id) {
      if (!teamDatesCache.has(row.project_id)) {
        teamDatesCache.set(row.project_id, await getProjectSessionDates(row.project_id));
      }
      teamSessionDates = teamDatesCache.get(row.project_id)!;
    }
    const marks = await getUserMarksInQuarter(row.user_id, quarterId);
    rates[row.user_id] = computeAttendanceRate({ totalSessionDates, teamSessionDates, marks });
  }

  return rates;
}

export interface MyAttendanceSummary extends AttendanceRateResult {
  projectName: string | null;
  marks: { date: string; mark: AttendanceMark }[];
}

/** A single member's own rate + recent marks for a quarter -- for the base-tier personal stats view. */
export async function getMyAttendanceSummary(
  userId: string,
  quarterId: string,
): Promise<MyAttendanceSummary> {
  const supabase = await createClient();
  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("project:projects!inner(id, client_name, quarter_id)")
    .eq("user_id", userId);

  if (error) throw error;

  const myProject = (
    memberships as unknown as { project: { id: string; client_name: string; quarter_id: string } | null }[]
  )
    .map((m) => m.project)
    .find((p): p is { id: string; client_name: string; quarter_id: string } => !!p && p.quarter_id === quarterId);

  const [totalSessionDates, teamSessionDates, marks] = await Promise.all([
    getQuarterSessionDates(quarterId),
    myProject ? getProjectSessionDates(myProject.id) : Promise.resolve([]),
    getUserMarksInQuarter(userId, quarterId),
  ]);

  const result = computeAttendanceRate({ totalSessionDates, teamSessionDates, marks });

  return { ...result, projectName: myProject?.client_name ?? null, marks };
}

/** This member's excused/unexcused/tardy marks across all their sessions in a quarter. */
export async function getUserMarksInQuarter(
  userId: string,
  quarterId: string,
): Promise<{ date: string; mark: AttendanceMark }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_marks")
    .select("mark, session:attendance_sessions!inner(date, project:projects!inner(quarter_id))")
    .eq("user_id", userId)
    .eq("session.project.quarter_id", quarterId);

  if (error) throw error;
  return (
    data as unknown as { mark: AttendanceMark; session: { date: string } }[]
  ).map((m) => ({ date: m.session.date, mark: m.mark }));
}
