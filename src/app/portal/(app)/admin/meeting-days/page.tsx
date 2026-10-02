import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { getMeetingDatesForQuarter } from "@/lib/data/meeting-dates";
import { MeetingDaysCalendar } from "./meeting-days-calendar";

export const metadata: Metadata = { title: "Admin · Meeting Days" };

export default async function MeetingDaysPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string }>;
}) {
  const { quarter } = await searchParams;
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

  const initialDates = await getMeetingDatesForQuarter(selectedQuarter.id);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Which days count as a meeting day for attendance tracking.
      </p>

      <MeetingDaysCalendar
        key={selectedQuarter.id}
        quarterId={selectedQuarter.id}
        quarterStartDate={selectedQuarter.start_date}
        quarterEndDate={selectedQuarter.end_date}
        initialDates={initialDates}
      />
    </div>
  );
}
