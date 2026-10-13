import type { SlotRow as CoffeeSlot } from "@/lib/data/coffee-chat";
import type { InterviewSlotRow } from "@/lib/data/interview";
import type { ClientMeetingSlotRow } from "@/lib/data/client-meeting";

export type AgendaKind = "coffee" | "interview" | "client";
export type AgendaState = "open" | "booked" | "hidden";

export interface AgendaItem {
  id: string;
  /** The slot's own id, for looking up the full row it came from. */
  slotId: string;
  kind: AgendaKind;
  /** True when the viewer hosts or sits on the panel for this slot. */
  mine: boolean;
  date: string;
  startTime: string;
  endTime: string;
  /** Who the slot is for, or what it is while still open. */
  title: string;
  /** Who runs it and where. May be empty. */
  detail: string;
  state: AgendaState;
}

export const AGENDA_KIND_LABEL: Record<AgendaKind, string> = {
  coffee: "Coffee chat",
  interview: "Interview",
  client: "Client call",
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
  /** The viewer, for the "mine" flag. */
  currentExecId?: string;
  /** Client calls are run by one fixed panel, so "mine" is whether the viewer is on it. */
  clientPanelExecIds?: string[];
}): AgendaItem[] {
  const me = input.currentExecId;
  const onClientPanel = !!me && (input.clientPanelExecIds ?? []).includes(me);
  const items: AgendaItem[] = [
    ...input.coffee.map<AgendaItem>((s) => ({
      id: `coffee:${s.id}`,
      slotId: s.id,
      kind: "coffee",
      mine: !!me && (s.execId1 === me || s.execId2 === me),
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      title: s.applicantName ?? "Open slot",
      detail: [[s.exec1Name, s.exec2Name].filter(Boolean).join(" and "), s.location].filter(Boolean).join(" · "),
      state: stateOf(s.published, s.bookingStatus),
    })),
    ...input.interviews.map<AgendaItem>((s) => ({
      id: `interview:${s.id}`,
      slotId: s.id,
      kind: "interview",
      mine: !!me && s.execs.some((e) => e.id === me),
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      title: s.applicantName ?? "Open slot",
      detail: s.execs.length > 0 ? `Panel: ${s.execs.map((e) => e.name).join(", ")}` : "No panel yet",
      state: stateOf(s.published, s.bookingStatus),
    })),
    ...input.clients.map<AgendaItem>((s) => ({
      id: `client:${s.id}`,
      slotId: s.id,
      kind: "client",
      mine: onClientPanel,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      title: s.businessName ?? "Open slot",
      detail: "",
      state: stateOf(s.published, s.bookingStatus),
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
