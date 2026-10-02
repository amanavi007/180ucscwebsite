import type { Metadata } from "next";
import { getCalendarEvents, getMyLeadProjects } from "@/lib/data/calendar";
import { getCurrentProfile } from "@/lib/data/profile";
import { getOrgTodayDateString } from "@/lib/date";
import { isExec } from "@/lib/auth/roles";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const [events, profile, leadProjects] = await Promise.all([
    getCalendarEvents(),
    getCurrentProfile(),
    getMyLeadProjects(),
  ]);
  const exec = isExec(profile.role);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Meeting days, project deadlines, org events, and project team items -- everything
          happening this month, in one place.
        </p>
      </div>
      <CalendarView
        events={events}
        today={getOrgTodayDateString()}
        isExec={exec}
        leadProjects={leadProjects}
      />
    </div>
  );
}
