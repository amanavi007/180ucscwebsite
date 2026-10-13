import type { Metadata } from "next";
import { getCalendarEvents, getMyLeadProjects } from "@/lib/data/calendar";
import { getCurrentProfile } from "@/lib/data/profile";
import { getOrgTodayDateString } from "@/lib/date";
import { isExec } from "@/lib/auth/roles";
import { PageHeader } from "@/components/page-header";
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
    <div className="flex flex-col gap-6 xl:h-full xl:min-h-0">
      <PageHeader
        title="Calendar"
        description="Meeting days, project deadlines, org events and project team items, in one place."
      />
      <CalendarView
        events={events}
        today={getOrgTodayDateString()}
        isExec={exec}
        leadProjects={leadProjects}
      />
    </div>
  );
}
