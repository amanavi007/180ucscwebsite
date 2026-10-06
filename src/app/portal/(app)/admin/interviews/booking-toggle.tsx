"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setInterviewBookingOpenAction } from "@/actions/interview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Opens or closes the public interview page without a deploy. */
export function BookingToggle({ open }: { open: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    startTransition(async () => {
      const result = await setInterviewBookingOpenAction(!open);
      if (result.error) toast.error(result.error);
      else toast.success(open ? "Interview booking closed." : "Interview booking opened.");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Badge variant={open ? "default" : "secondary"}>{open ? "Booking open" : "Booking closed"}</Badge>
      <Button variant="outline" onClick={toggle} disabled={isPending}>
        {open ? "Close booking" : "Open booking"}
      </Button>
    </div>
  );
}
