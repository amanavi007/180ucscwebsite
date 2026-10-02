import { addDays } from "date-fns";
import { withQuarterParam } from "./admin-nav";
import { parseLocalDate, toDateString } from "./date";

export type AttentionKind = "attendance" | "draft" | "coffee-chats" | "team-page";

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
  unbookedSlots: number | null;
  pendingTeamSubmissions: number | null;
}

export function countBelowThreshold(rows: { attendanceRate: number | null }[], threshold: number): number {
  return rows.filter((r) => r.attendanceRate !== null && r.attendanceRate < threshold).length;
}

export function hasUnfinalizedDraft(plans: { isFinalized: boolean }[]): boolean {
  return plans.length > 0 && !plans.some((p) => p.isFinalized);
}

export function countUnbookedSlotsThisWeek(
  slots: { date: string; published: boolean; bookingStatus: "open" | "booked" }[],
  today: string,
): number {
  const lastDay = toDateString(addDays(parseLocalDate(today), 6));
  return slots.filter(
    (s) => s.published && s.bookingStatus === "open" && s.date >= today && s.date <= lastDay,
  ).length;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildAttentionItems(counts: AttentionCounts): AttentionItem[] {
  const items: AttentionItem[] = [];

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
  if (counts.unbookedSlots && counts.unbookedSlots > 0) {
    items.push({
      kind: "coffee-chats",
      label: `${plural(counts.unbookedSlots, "open coffee-chat slot has", "open coffee-chat slots have")} no booking in the next 7 days`,
      actionLabel: "View slots",
      href: "/portal/admin/coffee-chats?tab=schedule",
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
