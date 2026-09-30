import type { Metadata } from "next";
import { getAllAvailability, getAllBookings, getAllSlots } from "@/lib/data/coffee-chat";
import { calendarFeedPath } from "@/lib/calendar-feed";
import { getCurrentProfile } from "@/lib/data/profile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvailabilityView } from "./availability-view";
import { BookingsView } from "./bookings-view";
import { SlotsView } from "./slots-view";

export const metadata: Metadata = { title: "Admin · Coffee Chats" };

export default async function CoffeeChatsPage() {
  const [availability, slots, bookings, profile] = await Promise.all([
    getAllAvailability(),
    getAllSlots(),
    getAllBookings(),
    getCurrentProfile(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coffee Chats</h1>
        <p className="text-sm text-muted-foreground">
          Set your availability, generate bookable slots, and see who&apos;s booked what.
        </p>
      </div>

      <Tabs defaultValue="availability">
        <TabsList>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="slots">Slots</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
        </TabsList>
        <TabsContent value="availability">
          <AvailabilityView availability={availability} currentExecId={profile.id} />
        </TabsContent>
        <TabsContent value="slots">
          <SlotsView slots={slots} currentExecId={profile.id} />
        </TabsContent>
        <TabsContent value="bookings">
          <BookingsView
            bookings={bookings}
            currentExecId={profile.id}
            feedUrl={`${process.env.NEXT_PUBLIC_SITE_URL}${calendarFeedPath(profile.id)}`}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
