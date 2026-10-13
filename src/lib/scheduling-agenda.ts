import type { SlotRow as CoffeeSlot } from "@/lib/data/coffee-chat";
import type { InterviewSlotRow } from "@/lib/data/interview";
import type { ClientMeetingSlotRow } from "@/lib/data/client-meeting";

export type AgendaKind = "coffee" | "interview" | "client";
export type AgendaState = "open" | "booked" | "hidden";

export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  date: string;
  startTime: string;
  endTime: string;
  /** Who the slot is for, or what it is while still open. */
  title: string;
  /** Who runs it and where. May be empty. */
  detail: string;
  state: AgendaState;
  /** Where to manage this kind of slot. */
  href: string;
}

export const AGENDA_KIND_LABEL: Record<AgendaKind, string> = {
  coffee: "Coffee chat",
  interview: "Interview",
  client: "Client call",
};

export const AGENDA_HREF: Record<AgendaKind, string> = {
  coffee: "/portal/admin/coffee-chats?tab=schedule",
  interview: "/portal/admin/interviews?tab=schedule",
  client: "/portal/admin/client-meetings?tab=slots",
};

function stateOf(published: boolean, booking: "open" | "booked"): AgendaState {
  if (!published) return "hidden";
  return booking === "booked" ? "booked" : "open";
}

/** Puts coffee chat, interview and client call slots into one list shape so they can be shown together. */
export function buildAgenda(input: {
  coffee: CoffeeSlot[];
  interviews: InterviewSlotRow[];
  clients: ClientMeetingSlotRow[];
}): AgendaItem[] {
  const items: AgendaItem[] = [
    ...input.coffee.map<AgendaItem>((s) => ({
      id: `coffee:${s.id}`,
      kind: "coffee",
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      title: s.applicantName ?? "Open slot",
      detail: [[s.exec1Name, s.exec2Name].filter(Boolean).join(" and "), s.location].filter(Boolean).join(" · "),
      state: stateOf(s.published, s.bookingStatus),
      href: AGENDA_HREF.coffee,
    })),
    ...input.interviews.map<AgendaItem>((s) => ({
      id: `interview:${s.id}`,
      kind: "interview",
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      title: s.applicantName ?? "Open slot",
      detail: s.execs.length > 0 ? `Panel: ${s.execs.map((e) => e.name).join(", ")}` : "No panel yet",
      state: stateOf(s.published, s.bookingStatus),
      href: AGENDA_HREF.interview,
    })),
    ...input.clients.map<AgendaItem>((s) => ({
      id: `client:${s.id}`,
      kind: "client",
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      title: s.businessName ?? "Open slot",
      detail: "",
      state: stateOf(s.published, s.bookingStatus),
      href: AGENDA_HREF.client,
    })),
  ];
  return items.sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
}

/** Groups an already-sorted agenda by date, keeping order. */
export function groupByDate(items: AgendaItem[]): { date: string; items: AgendaItem[] }[] {
  const groups: { date: string; items: AgendaItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, items: [item] });
  }
  return groups;
}
