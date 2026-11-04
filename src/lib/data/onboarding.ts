import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchInChunks } from "@/lib/paginate";
import type { OnboardingMark } from "@/lib/supabase/database.types";
import {
  DEFAULT_ONBOARDING_THRESHOLDS,
  type OnboardingThresholds,
} from "@/lib/onboarding-attendance";

export interface OnboardingJc {
  id: string;
  name: string;
  email: string | null;
  removedAt: string | null;
  removedReason: string | null;
  createdAt: string;
}

export interface OnboardingMeeting {
  id: string;
  date: string;
  taken: boolean;
  takenByName: string | null;
}

export interface OnboardingMarkRow {
  meetingId: string;
  jcId: string;
  mark: OnboardingMark;
}

export interface OnboardingData {
  jcs: OnboardingJc[];
  meetings: OnboardingMeeting[];
  marks: OnboardingMarkRow[];
}

/** Everything the onboarding page needs for one quarter. Exec-only (RLS). */
export async function getOnboardingData(quarterId: string): Promise<OnboardingData> {
  const supabase = await createClient();
  const [jcsRes, meetingsRes] = await Promise.all([
    supabase
      .from("onboarding_jcs")
      .select("id, name, email, removed_at, removed_reason, created_at")
      .eq("quarter_id", quarterId)
      .order("name", { ascending: true }),
    supabase
      .from("onboarding_meetings")
      .select("id, date, taken_at, taker:profiles!onboarding_meetings_taken_by_fkey(name)")
      .eq("quarter_id", quarterId)
      .order("date", { ascending: true }),
  ]);
  if (jcsRes.error) throw jcsRes.error;
  if (meetingsRes.error) throw meetingsRes.error;

  const meetings = (
    meetingsRes.data as unknown as { id: string; date: string; taken_at: string | null; taker: { name: string } | null }[]
  ).map((m) => ({ id: m.id, date: m.date, taken: !!m.taken_at, takenByName: m.taker?.name ?? null }));

  const marks = await fetchInChunks(
    meetings.map((m) => m.id),
    (chunk, from, to) =>
      supabase.from("onboarding_marks").select("meeting_id, jc_id, mark").in("meeting_id", chunk).order("id").range(from, to),
  );

  return {
    jcs: jcsRes.data.map((j) => ({
      id: j.id,
      name: j.name,
      email: j.email,
      removedAt: j.removed_at,
      removedReason: j.removed_reason,
      createdAt: j.created_at,
    })),
    meetings,
    marks: marks.map((m) => ({ meetingId: m.meeting_id, jcId: m.jc_id, mark: m.mark })),
  };
}

/** Absence thresholds from Admin > Settings; defaults when unset. Exec-only (RLS). */
export async function getOnboardingThresholds(): Promise<OnboardingThresholds> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("key, value")
    .in("key", ["onboarding_max_unexcused", "onboarding_max_absences", "onboarding_min_rate"]);
  const get = (key: string, fallback: number) => {
    const raw = data?.find((r) => r.key === key)?.value;
    const n = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    maxUnexcused: get("onboarding_max_unexcused", DEFAULT_ONBOARDING_THRESHOLDS.maxUnexcused),
    maxAbsences: get("onboarding_max_absences", DEFAULT_ONBOARDING_THRESHOLDS.maxAbsences),
    minRate: get("onboarding_min_rate", DEFAULT_ONBOARDING_THRESHOLDS.minRate),
  };
}
