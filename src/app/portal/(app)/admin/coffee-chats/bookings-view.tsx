"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelBookingAsAdminAction } from "@/actions/coffee-chat";
import type { BookingRow } from "@/lib/data/coffee-chat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function BookingsView({ bookings }: { bookings: BookingRow[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel(bookingId: string) {
    startTransition(async () => {
      const result = await cancelBookingAsAdminAction(bookingId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Booking cancelled.");
      router.refresh();
    });
  }

  if (bookings.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">No bookings yet.</p>;
  }

  return (
    <Table className="mt-4">
      <TableHeader>
        <TableRow>
          <TableHead>Applicant</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>With</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {bookings.map((b) => (
          <TableRow key={b.id}>
            <TableCell>{b.applicantName}</TableCell>
            <TableCell>{b.applicantEmail}</TableCell>
            <TableCell>{b.date}</TableCell>
            <TableCell>{b.startTime}</TableCell>
            <TableCell>{b.location || "—"}</TableCell>
            <TableCell>
              {b.exec1Name}
              {b.exec2Name ? ` & ${b.exec2Name}` : ""}
            </TableCell>
            <TableCell>
              <Badge variant={b.status === "confirmed" ? "default" : "secondary"}>{b.status}</Badge>
            </TableCell>
            <TableCell>
              {b.status === "confirmed" && (
                <Button variant="outline" size="sm" onClick={() => handleCancel(b.id)} disabled={isPending}>
                  Cancel
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
