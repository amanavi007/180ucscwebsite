import { withQuarterParam } from "./admin-nav";

export type AttentionKind =
  | "task-reviews"
  | "marks"
  | "reviewers"
  | "interview-slots"
  | "attendance"
  | "draft"
  | "team-page"
  | "outreach-replies"
  | "outreach-attention";

export interface AttentionItem {
  kind: AttentionKind;
  label: string;
  actionLabel: string;
  href: string;
}

/** `null` on any field means that data source was unavailable, so its item is omitted. */
export interface AttentionCounts {
  quarterId: string | null;
  lowAttendance: number | null;
  draftUnfinalized: boolean | null;
  pendingTeamSubmissions: number | null;
  /** Recruiting bookings (coffee chats, interviews) that have happened but are not marked yet. */
  bookingsToMark?: number | null;
  /** Applicants who have no reviewer assigned. */
  applicantsWithoutReviewer?: number | null;
  /** Invitees still waiting to book, minus open interview slots. Only positive when slots are short. */
  interviewSlotShortfall?: number | null;
  /** Task reviews (prelim research / deliverable) assigned to the viewing exec and not yet marked done. */
  taskReviews?: number | null;
  /** Outreach prospects who replied and have not been followed up on. */
  outreachReplies?: number | null;
  /** Outreach prospects stopped for a human look (thin research, a failed draft, a manual stop). */
  outreachNeedsAttention?: number | null;
}

export function countBelowThreshold(rows: { attendanceRate: number | null }[], threshold: number): number {
  return rows.filter((r) => r.attendanceRate !== null && r.attendanceRate < threshold).length;
}

export function hasUnfinalizedDraft(plans: { isFinalized: boolean }[]): boolean {
  return plans.length > 0 && !plans.some((p) => p.isFinalized);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildAttentionItems(counts: AttentionCounts): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (counts.taskReviews && counts.taskReviews > 0) {
    items.push({
      kind: "task-reviews",
      label: `${plural(counts.taskReviews, "consultant task is", "consultant tasks are")} waiting for your review`,
      actionLabel: "Review",
      href: "/portal/admin/task-reviews",
    });
  }
  if (counts.outreachReplies && counts.outreachReplies > 0) {
    items.push({
      kind: "outreach-replies",
      label: `${plural(counts.outreachReplies, "outreach reply is", "outreach replies are")} waiting for an exec`,
      actionLabel: "Open outreach",
      href: "/portal/admin/outreach?stage=needs-you",
    });
  }
  if (counts.outreachNeedsAttention && counts.outreachNeedsAttention > 0) {
    items.push({
      kind: "outreach-attention",
      label: `${plural(counts.outreachNeedsAttention, "outreach prospect needs", "outreach prospects need")} a look`,
      actionLabel: "Open outreach",
      href: "/portal/admin/outreach?stage=needs-you",
    });
  }

  if (counts.bookingsToMark && counts.bookingsToMark > 0) {
    items.push({
      kind: "marks",
      label: `${plural(counts.bookingsToMark, "recruiting booking still needs", "recruiting bookings still need")} to be marked`,
      actionLabel: "Mark attendance",
      href: withQuarterParam("/portal/admin/applicants?tab=attendance", counts.quarterId),
    });
  }
  if (counts.applicantsWithoutReviewer && counts.applicantsWithoutReviewer > 0) {
    items.push({
      kind: "reviewers",
      label: `${plural(counts.applicantsWithoutReviewer, "applicant has", "applicants have")} no reviewer yet`,
      actionLabel: "Assign reviewers",
      href: withQuarterParam("/portal/admin/applicants?tab=progress", counts.quarterId),
    });
  }
  if (counts.interviewSlotShortfall && counts.interviewSlotShortfall > 0) {
    items.push({
      kind: "interview-slots",
      label: `Add ${plural(counts.interviewSlotShortfall, "more interview slot", "more interview slots")} so everyone invited can book`,
      actionLabel: "Add availability",
      href: "/portal/admin/scheduling",
    });
  }

  if (counts.lowAttendance && counts.lowAttendance > 0) {
    items.push({
      kind: "attendance",
      label: `${plural(counts.lowAttendance, "consultant is", "consultants are")} below the attendance threshold`,
      actionLabel: "See who",
      href: withQuarterParam("/portal/admin/stats", counts.quarterId),
    });
  }
  if (counts.draftUnfinalized) {
    items.push({
      kind: "draft",
      label: "A team draft hasn't been finalized",
      actionLabel: "Review draft",
      href: withQuarterParam("/portal/admin/team-builder", counts.quarterId),
    });
  }
  if (counts.pendingTeamSubmissions && counts.pendingTeamSubmissions > 0) {
    items.push({
      kind: "team-page",
      label: `${plural(counts.pendingTeamSubmissions, "team-page submission is", "team-page submissions are")} waiting for review`,
      actionLabel: "Review",
      href: "/portal/admin/team-page",
    });
  }

  return items;
}
