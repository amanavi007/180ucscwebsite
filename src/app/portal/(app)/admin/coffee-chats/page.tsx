import type { Metadata } from "next";
import { getAllAvailability } from "@/lib/data/coffee-chat";
import { getCurrentProfile } from "@/lib/data/profile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvailabilityView } from "./availability-view";

export const metadata: Metadata = { title: "Admin · Coffee Chats" };

export default async function CoffeeChatsPage() {
  const [availability, profile] = await Promise.all([getAllAvailability(), getCurrentProfile()]);

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
        <TabsContent value="slots">{/* added in Task 7 */}</TabsContent>
        <TabsContent value="bookings">{/* added in Task 8 */}</TabsContent>
      </Tabs>
    </div>
  );
}
