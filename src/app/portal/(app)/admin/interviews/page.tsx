import type { Metadata } from "next";
import {
  getInterviewAdminSettings,
  getInterviewAvailability,
  getInterviewBookings,
  getInterviewSlots,
  getInvitees,
} from "@/lib/data/interview";
import { calendarFeedPath } from "@/lib/calendar-feed";
import { getCurrentProfile } from "@/lib/data/profile";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/url-tabs";
import { BookingToggle } from "./booking-toggle";
import { InviteesView } from "./invitees-view";
import { AvailabilityView } from "./availability-view";
import { ScheduleView } from "./schedule-view";

export const metadata: Metadata = { title: "Admin · Interviews" };

export default async function InterviewsPage() {
  const [invitees, availability, slots, bookings, settings, profile] = await Promise.all([
    getInvitees(),
    getInterviewAvailability(),
    getInterviewSlots(),
    getInterviewBookings(),
    getInterviewAdminSettings(),
    getCurrentProfile(),
  ]);

  const openSlotCount = slots.filter((s) => s.published && s.bookingStatus === "open").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl leading-tight">Interviews</h1>
          <p className="text-sm text-muted-foreground">
            Invite applicants, set your availability, then manage the interview schedule: who&apos;s on each panel and who&apos;s booked.
          </p>
        </div>
        <BookingToggle open={settings.bookingOpen} />
      </div>

      <UrlTabs values={["invitees", "availability", "schedule"]} fallback="invitees">
        <TabsList>
          <TabsTrigger value="invitees">Invitees</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>
        <TabsContent value="invitees">
          <InviteesView invitees={invitees} openSlotCount={openSlotCount} />
        </TabsContent>
        <TabsContent value="availability">
          <AvailabilityView availability={availability} currentExecId={profile.id} />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleView
            slots={slots}
            bookings={bookings}
            currentExecId={profile.id}
            feedUrl={`${process.env.NEXT_PUBLIC_SITE_URL}${calendarFeedPath(profile.id)}`}
          />
        </TabsContent>
      </UrlTabs>
    </div>
  );
}
