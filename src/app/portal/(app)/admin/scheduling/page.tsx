import type { Metadata } from "next";
import { getAllAvailability, getAllBookings, getAllSlots } from "@/lib/data/coffee-chat";
import {
  getInterviewAdminSettings,
  getInterviewAvailability,
  getInterviewBookings,
  getInterviewSlots,
  getInvitees,
} from "@/lib/data/interview";
import {
  getClientMeetingAvailability,
  getClientMeetingBookings,
  getClientMeetingExecOptions,
  getClientMeetingSettings,
  getClientMeetingSlots,
} from "@/lib/data/client-meeting";
import { calendarFeedPath } from "@/lib/calendar-feed";
import { getCurrentProfile } from "@/lib/data/profile";
import { getOrgTodayDateString } from "@/lib/date";
import { SchedulingWorkspace } from "./scheduling-workspace";

export const metadata: Metadata = { title: "Admin · Scheduling" };

/** One area failing should not take the whole page down: it is logged and treated as empty. */
async function orFallback<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error("Scheduling source failed:", error);
    return fallback;
  }
}

export default async function SchedulingPage() {
  const profile = await getCurrentProfile();
  const [
    coffeeSlots,
    coffeeBookings,
    coffeeAvailability,
    interviewSlots,
    interviewBookings,
    interviewAvailability,
    invitees,
    interviewSettings,
    clientSlots,
    clientBookings,
    clientAvailability,
    clientSettings,
    clientExecOptions,
  ] = await Promise.all([
    orFallback(getAllSlots(), []),
    orFallback(getAllBookings(), []),
    orFallback(getAllAvailability(), []),
    orFallback(getInterviewSlots(), []),
    orFallback(getInterviewBookings(), []),
    orFallback(getInterviewAvailability(), []),
    orFallback(getInvitees(), []),
    orFallback(getInterviewAdminSettings(), { bookingOpen: false, slotMinutes: 30, windowStart: null, windowEnd: null }),
    orFallback(getClientMeetingSlots(), []),
    orFallback(getClientMeetingBookings(), []),
    orFallback(getClientMeetingAvailability(), []),
    orFallback(getClientMeetingSettings(), { bookingOpen: false, slotMinutes: 30, panelExecIds: [] as string[] }),
    orFallback(getClientMeetingExecOptions(), []),
  ]);

  return (
    <SchedulingWorkspace
      today={getOrgTodayDateString()}
      currentExecId={profile.id}
      feedUrl={`${process.env.NEXT_PUBLIC_SITE_URL}${calendarFeedPath(profile.id)}`}
      coffee={{ slots: coffeeSlots, bookings: coffeeBookings, availability: coffeeAvailability }}
      interviews={{
        slots: interviewSlots,
        bookings: interviewBookings,
        availability: interviewAvailability,
        invitees,
        bookingOpen: interviewSettings.bookingOpen,
        windowStart: interviewSettings.windowStart,
        windowEnd: interviewSettings.windowEnd,
      }}
      clients={{
        slots: clientSlots,
        bookings: clientBookings,
        availability: clientAvailability,
        bookingOpen: clientSettings.bookingOpen,
        panelExecIds: clientSettings.panelExecIds,
        execOptions: clientExecOptions,
      }}
    />
  );
}
