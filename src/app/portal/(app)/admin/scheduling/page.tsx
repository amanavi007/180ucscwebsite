import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getAllSlots } from "@/lib/data/coffee-chat";
import { getInterviewSlots } from "@/lib/data/interview";
import { getClientMeetingSlots } from "@/lib/data/client-meeting";
import { getOrgTodayDateString } from "@/lib/date";
import { buildAgenda, AGENDA_HREF } from "@/lib/scheduling-agenda";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AgendaView } from "./agenda-view";

export const metadata: Metadata = { title: "Admin · Scheduling" };

async function orEmpty<T>(promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch (error) {
    // One area failing should not hide the other two.
    console.error("Scheduling agenda source failed:", error);
    return [];
  }
}

export default async function SchedulingPage() {
  const [coffee, interviews, clients] = await Promise.all([
    orEmpty(getAllSlots()),
    orEmpty(getInterviewSlots()),
    orEmpty(getClientMeetingSlots()),
  ]);
  const today = getOrgTodayDateString();
  const upcoming = buildAgenda({ coffee, interviews, clients }).filter((i) => i.date >= today);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduling"
        description="Everything with a time on it, in one list. Open a type to set availability or edit slots."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="lg">
                  Add slots
                  <ChevronDown />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem render={<Link href={AGENDA_HREF.coffee} />}>Coffee chat slots</DropdownMenuItem>
              <DropdownMenuItem render={<Link href={AGENDA_HREF.interview} />}>Interview slots</DropdownMenuItem>
              <DropdownMenuItem render={<Link href={AGENDA_HREF.client} />}>Client call slots</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <AgendaView items={upcoming} today={today} />
    </div>
  );
}
