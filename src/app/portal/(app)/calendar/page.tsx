import type { Metadata } from "next";
import { getCalendarEvents } from "@/lib/data/calendar";
import { getCurrentProfile } from "@/lib/data/profile";
import { getOrgTodayDateString } from "@/lib/date";
import { isExec } from "@/lib/auth/roles";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const [events, profile] = await Promise.all([getCalendarEvents(), getCurrentProfile()]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Meeting days, project deadlines, and org events -- everything happening this month, in
          one place.
        </p>
      </div>
      <CalendarView events={events} today={getOrgTodayDateString()} isExec={isExec(profile.role)} />
    </div>
  );
}
