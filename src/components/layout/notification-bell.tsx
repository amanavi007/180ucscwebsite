"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Bell } from "lucide-react";
import { markNotificationsRead } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NotificationItem } from "@/lib/data/notifications";

export function NotificationBell({
  items,
  unreadCount,
}: {
  items: NotificationItem[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && unreadCount > 0) {
      markNotificationsRead().then(() => router.refresh());
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
            <Bell className="size-4.5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex size-2 rounded-full bg-primary" />
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-medium">Notifications</div>
        {items.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block border-b px-3 py-2.5 text-sm last:border-b-0 hover:bg-muted/50"
              >
                <p>{item.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDistanceToNowStrict(new Date(item.occurredAt), { addSuffix: true })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
