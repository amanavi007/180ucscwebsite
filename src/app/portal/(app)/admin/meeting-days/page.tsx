import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { getMeetingDatesForQuarter } from "@/lib/data/meeting-dates";
import { PageHeader } from "@/components/page-header";
import { getMeetingTime } from "@/lib/data/meeting-time";
import { formatMeetingTime } from "@/lib/meeting-time";
import { MeetingTimeCard } from "./meeting-time-card";
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
        No quarters yet. Create one in Setup first.
      </p>
    );
  }

  const selectedQuarter =
    quarters.find((q) => q.id === quarter) ?? quarters.find((q) => q.is_active) ?? quarters[0];

  const [initialDates, meetingTime] = await Promise.all([getMeetingDatesForQuarter(selectedQuarter.id), getMeetingTime()]);

  return (
    <div className="space-y-6">
      <PageHeader title="Meeting days" description={`${selectedQuarter.name} · the days that count as a meeting for attendance.`} />

      <MeetingTimeCard time={meetingTime} />

      <MeetingDaysCalendar
        key={selectedQuarter.id}
        quarterId={selectedQuarter.id}
        quarterStartDate={selectedQuarter.start_date}
        quarterEndDate={selectedQuarter.end_date}
        initialDates={initialDates}
        timeLabel={formatMeetingTime(meetingTime)}
      />
    </div>
  );
}
