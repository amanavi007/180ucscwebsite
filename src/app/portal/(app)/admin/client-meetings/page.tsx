import type { Metadata } from "next";
import {
  getClientMeetingAvailability,
  getClientMeetingBookings,
  getClientMeetingExecOptions,
  getClientMeetingSettings,
  getClientMeetingSlots,
} from "@/lib/data/client-meeting";
import { PANEL_SIZE } from "@/lib/client-meeting";
import { calendarFeedPath } from "@/lib/calendar-feed";
import { getCurrentProfile } from "@/lib/data/profile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingToggle } from "./booking-toggle";
import { PanelView } from "./panel-view";
import { AvailabilityView } from "./availability-view";
import { SlotsView } from "./slots-view";
import { BookingsView } from "./bookings-view";

export const metadata: Metadata = { title: "Admin · Client Meetings" };

export default async function ClientMeetingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const [settings, execOptions, availability, slots, bookings, profile] = await Promise.all([
    getClientMeetingSettings(),
    getClientMeetingExecOptions(),
    getClientMeetingAvailability(),
    getClientMeetingSlots(),
    getClientMeetingBookings(),
    getCurrentProfile(),
  ]);

  const openSlotCount = slots.filter((s) => s.published && s.bookingStatus === "open").length;
  const defaultTab = tab === "availability" || tab === "slots" || tab === "bookings" ? tab : "panel";
  const panelIncomplete = settings.panelExecIds.length !== PANEL_SIZE;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Client Meetings</h1>
          <p className="text-sm text-muted-foreground">
            Pick the 3-exec panel, add availability, publish slots, and manage client bookings. {openSlotCount} open slots.
          </p>
        </div>
        <BookingToggle open={settings.bookingOpen} />
      </div>

      {panelIncomplete && (
        <p className="rounded-xl border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Pick a panel of exactly 3 execs before generating slots or opening booking.
        </p>
      )}

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="panel">Panel</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="slots">Slots</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
        </TabsList>
        <TabsContent value="panel">
          <PanelView execOptions={execOptions} panelExecIds={settings.panelExecIds} />
        </TabsContent>
        <TabsContent value="availability">
          <AvailabilityView
            availability={availability}
            currentExecId={profile.id}
            panelExecIds={settings.panelExecIds}
          />
        </TabsContent>
        <TabsContent value="slots">
          <SlotsView slots={slots} feedUrl={`${process.env.NEXT_PUBLIC_SITE_URL}${calendarFeedPath(profile.id)}`} />
        </TabsContent>
        <TabsContent value="bookings">
          <BookingsView bookings={bookings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
