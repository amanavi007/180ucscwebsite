import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { getMeetingDatesForQuarter } from "@/lib/data/meeting-dates";
import { getRoomBookingsForDate } from "@/lib/data/room-bookings";
import { getRoomHotspots } from "@/lib/data/room-hotspots";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { getOrgTodayDateString } from "@/lib/date";
import { DateSelect } from "./date-select";
import { RoomMap } from "./room-map";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin · Rooms" };

/** Prefer today; otherwise the closest upcoming meeting day, falling back to the most recent past one. */
function pickDefaultDate(dates: string[], today: string): string | null {
  if (dates.length === 0) return null;
  if (dates.includes(today)) return today;
  const upcoming = dates.find((d) => d > today);
  if (upcoming) return upcoming;
  return dates[dates.length - 1];
}

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string; date?: string }>;
}) {
  const { quarter, date } = await searchParams;
  const quarters = await getQuarters();

  if (quarters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No quarters yet -- create one in the Quarters tab first.
      </p>
    );
  }

  const selectedQuarter =
    quarters.find((q) => q.id === quarter) ?? quarters.find((q) => q.is_active) ?? quarters[0];

  const today = getOrgTodayDateString();
  const meetingDates = await getMeetingDatesForQuarter(selectedQuarter.id);

  if (meetingDates.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No meeting days set up for this quarter yet -- add some in the Meeting Days tab first.
        </p>
      </div>
    );
  }

  const selectedDate =
    (date && meetingDates.includes(date) ? date : null) ?? pickDefaultDate(meetingDates, today)!;

  const teams = await getRoomBookingsForDate(selectedQuarter.id, selectedDate);
  const hotspots = await getRoomHotspots();
  const profile = await getCurrentProfile();
  const canEditHotspots = isExec(profile.role);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Which room each team is in for a meeting day -- visible to everyone.
      </p>
      <DateSelect
        quarterId={selectedQuarter.id}
        dates={meetingDates}
        selectedDate={selectedDate}
        today={today}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rooms</CardTitle>
          <CardDescription>
            {teams.length === 0
              ? "No teams in this quarter yet."
              : "Click a team, then click its room on the map."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RoomMap
            date={selectedDate}
            teams={teams}
            hotspots={hotspots}
            canEditHotspots={canEditHotspots}
          />
        </CardContent>
      </Card>
    </div>
  );
}
