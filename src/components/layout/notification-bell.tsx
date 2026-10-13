"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Bell } from "lucide-react";
import { markNotificationsRead, getMyNotificationsAction } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NotificationFeed } from "@/lib/data/notifications";

/**
 * Fetches its own data on mount instead of receiving it as a server-rendered
 * prop -- this keeps the ~5 notification queries off the critical path of
 * every page navigation (they're the same regardless of which tab you're on).
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<NotificationFeed | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyNotificationsAction()
      .then((result) => {
        if (!cancelled) setFeed(result);
      })
      .catch(() => {
        // Leaves the bell showing "caught up" rather than spinning forever
        // on a transient fetch failure -- notifications aren't critical path.
        if (!cancelled) setFeed({ items: [], unreadCount: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = feed?.items ?? [];
  const unreadCount = feed?.unreadCount ?? 0;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && unreadCount > 0) {
      setFeed((prev) => (prev ? { ...prev, unreadCount: 0 } : prev));
      markNotificationsRead();
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
            <Bell className="size-4.5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex size-2 rounded-full bg-link" />
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-medium">Notifications</div>
        {feed === null ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
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
