import { differenceInCalendarDays } from "date-fns";
import { parseLocalDate } from "@/lib/date";

/** "initial_research" -> "Initial research" */
export function humanize(value: string): string {
  const text = value.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export type Tone = "good" | "warn" | "bad";

/** Color band for an attendance percentage: 80+ good, 60-79 warn, below 60 bad. */
export function attendanceTone(ratePct: number): Tone {
  if (ratePct >= 80) return "good";
  if (ratePct >= 60) return "warn";
  return "bad";
}

export function deadlineLabel(deadline: string | null, todayIso: string): { text: string; overdue: boolean } {
  if (!deadline) return { text: "No deadline", overdue: false };
  const days = differenceInCalendarDays(parseLocalDate(deadline), parseLocalDate(todayIso));
  if (days < 0) {
    const n = -days;
    return { text: `${n} ${n === 1 ? "day" : "days"} overdue`, overdue: true };
  }
  if (days === 0) return { text: "today", overdue: false };
  if (days === 1) return { text: "tomorrow", overdue: false };
  return { text: `in ${days} days`, overdue: false };
}

/** Width of a bar as a whole percent of `max`, clamped to 0-100. */
export function barPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}
