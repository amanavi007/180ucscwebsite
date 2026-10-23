import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/paginate";
import { getInterviewSlots } from "@/lib/data/interview";
import { getResearchPrompts } from "@/lib/data/org-settings";
import { asClocks, type Clocks } from "@/lib/interview-timers";
import type { Recommendation, ResearchPrompt, Scores } from "@/lib/interview-guide";

export interface SessionView {
  id: string;
  behavioralKeys: string[];
  researchKey: string | null;
  caseKey: string | null;
  timers: Clocks;
  notes: Record<string, string>;
  notesUpdatedBy: string | null;
  notesUpdatedAt: string | null;
  /** The one shared scorecard for this interview. */
  scores: Scores;
  recommendation: Recommendation | null;
  scoredAt: string | null;
  scoredBy: string | null;
}

export interface InterviewApplicant {
  id: string;
  major: string | null;
  year: string | null;
  applicationLink: string | null;
  resumeUrl: string | null;
  essays: { label: string; text: string }[];
}

export interface InterviewRow {
  /** Booking id when the interview was booked, otherwise the applicant id (a manual interview). */
  key: string;
  bookingId: string | null;
  name: string;
  email: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  execs: { id: string; name: string }[];
  /** The viewer is on this interview's panel. */
  mine: boolean;
  applicant: InterviewApplicant | null;
  session: SessionView | null;
}

export interface InterviewWorkspace {
  rows: InterviewRow[];
  /** Applicants with no interview row yet, for starting one by hand. */
  pickable: { id: string; name: string; email: string | null }[];
  today: string;
  /** The research prompts to pick from, as edited in Settings. */
  researchPrompts: ResearchPrompt[];
}

const CHUNK = 100;

async function chunked<R>(ids: string[], load: (chunk: string[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await load(ids.slice(i, i + CHUNK))));
  return out;
}

function asNotes(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

export async function getInterviewWorkspace(quarterId: string, viewerId: string, today: string): Promise<InterviewWorkspace> {
  const supabase = await createClient();
  const [slots, applicants, researchPrompts] = await Promise.all([
    getInterviewSlots(),
    fetchAllPages((from, to) =>
      supabase
        .from("recruit_applicants")
        .select("id, name, email, major, year, application_link")
        .eq("quarter_id", quarterId)
        .is("archived_at", null)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    getResearchPrompts(),
  ]);

  const booked = slots.filter((s) => s.bookingStatus === "booked" && s.bookingId);
  const byEmail = new Map(applicants.filter((a) => a.email).map((a) => [a.email as string, a]));
  const applicantIdOf = (email: string | null) => (email ? byEmail.get(email)?.id ?? null : null);

  const bookingIds = booked.map((s) => s.bookingId as string);
  const matchedApplicantIds = booked.map((s) => applicantIdOf(s.applicantEmail)).filter((id): id is string => !!id);

  // A session is found by its booking or by its applicant, since a manual interview has no booking.
  const [byBooking, byApplicant] = await Promise.all([
    chunked(bookingIds, async (ids) => {
      const { data, error } = await supabase.from("interview_sessions").select("*").in("booking_id", ids); // in-ok: already one chunked() slice
      if (error) throw error;
      return data ?? [];
    }),
    chunked(applicants.map((a) => a.id), async (ids) => {
      const { data, error } = await supabase.from("interview_sessions").select("*").in("applicant_id", ids); // in-ok: already one chunked() slice
      if (error) throw error;
      return data ?? [];
    }),
  ]);
  const sessionRows = [...new Map([...byBooking, ...byApplicant].map((s) => [s.id, s])).values()];
  const sessionByBooking = new Map(sessionRows.filter((s) => s.booking_id).map((s) => [s.booking_id as string, s]));
  const sessionByApplicant = new Map(sessionRows.filter((s) => s.applicant_id).map((s) => [s.applicant_id as string, s]));

  const profileIds = [
    ...new Set([
      ...sessionRows.map((s) => s.notes_updated_by).filter((id): id is string => !!id),
      ...sessionRows.map((s) => s.scored_by).filter((id): id is string => !!id),
    ]),
  ];
  const names = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data, error } = await supabase.from("profiles").select("id, name").in("id", profileIds); // in-ok: profile ids of execs
    if (error) throw error;
    for (const p of data ?? []) names.set(p.id, p.name);
  }

  const answersById = new Map<string, { resume_url: string | null; essay_why: string | null; essay_teamwork: string | null; essay_bring: string | null }>();
  const answerTargets = [...new Set([...matchedApplicantIds, ...sessionRows.map((s) => s.applicant_id).filter((id): id is string => !!id)])];
  for (const row of await chunked(answerTargets, async (ids) => {
    const { data, error } = await supabase
      .from("recruit_applicant_answers")
      .select("applicant_id, resume_url, essay_why, essay_teamwork, essay_bring")
      .in("applicant_id", ids); // in-ok: already one chunked() slice
    if (error) throw error;
    return data ?? [];
  })) {
    answersById.set(row.applicant_id, row);
  }

  const applicantById = new Map(applicants.map((a) => [a.id, a]));
  const applicantView = (id: string | null): InterviewApplicant | null => {
    const a = id ? applicantById.get(id) : null;
    if (!a) return null;
    const answers = answersById.get(a.id);
    const essays = [
      { label: "Why 180?", text: answers?.essay_why ?? "" },
      { label: "Teamwork", text: answers?.essay_teamwork ?? "" },
      { label: "What they bring", text: answers?.essay_bring ?? "" },
    ].filter((e) => e.text.trim() !== "");
    return {
      id: a.id,
      major: a.major,
      year: a.year,
      applicationLink: a.application_link,
      resumeUrl: answers?.resume_url ?? null,
      essays,
    };
  };

  const sessionView = (s: (typeof sessionRows)[number] | undefined): SessionView | null =>
    s
      ? {
          id: s.id,
          behavioralKeys: s.behavioral_keys ?? [],
          researchKey: s.research_key,
          caseKey: s.case_key,
          timers: asClocks(s.timers),
          notes: asNotes(s.notes),
          notesUpdatedBy: s.notes_updated_by ? names.get(s.notes_updated_by) ?? null : null,
          notesUpdatedAt: s.notes_updated_at,
          scores: (s.scores ?? {}) as Scores,
          recommendation: s.recommendation as Recommendation | null,
          scoredAt: s.scored_at,
          scoredBy: s.scored_by ? names.get(s.scored_by) ?? null : null,
        }
      : null;

  const rows: InterviewRow[] = booked.map((s) => {
    const applicantId = applicantIdOf(s.applicantEmail);
    const session = sessionByBooking.get(s.bookingId as string) ?? (applicantId ? sessionByApplicant.get(applicantId) : undefined);
    return {
      key: s.bookingId as string,
      bookingId: s.bookingId,
      name: s.applicantName ?? "Unknown",
      email: s.applicantEmail,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      execs: s.execs,
      mine: s.execs.some((e) => e.id === viewerId),
      applicant: applicantView(applicantId),
      session: sessionView(session),
    };
  });

  // Interviews started by hand for someone who never booked a slot.
  const seen = new Set(rows.flatMap((r) => (r.session ? [r.session.id] : [])));
  for (const s of sessionRows) {
    if (seen.has(s.id) || !s.applicant_id) continue;
    const a = applicantById.get(s.applicant_id);
    if (!a) continue;
    rows.push({
      key: a.id,
      bookingId: null,
      name: a.name,
      email: a.email,
      date: null,
      startTime: null,
      endTime: null,
      execs: [],
      mine: s.created_by === viewerId,
      applicant: applicantView(a.id),
      session: sessionView(s),
    });
    seen.add(s.id);
  }

  const taken = new Set(rows.flatMap((r) => (r.applicant ? [r.applicant.id] : [])));
  const pickable = applicants.filter((a) => !taken.has(a.id)).map((a) => ({ id: a.id, name: a.name, email: a.email }));

  return { rows, pickable, today, researchPrompts };
}
