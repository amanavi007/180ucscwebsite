"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { QuarterSelect } from "@/components/quarter-select";
import { ADMIN_NAV_LINKS } from "@/components/layout/nav-links";
import { ADMIN_HUB_HREF, getAdminLocation, resolveQuarterId, withQuarterParam } from "@/lib/admin-nav";

export function AdminBreadcrumb({
  pendingTeamCount,
  quarters,
  defaultQuarterId,
}: {
  pendingTeamCount: number;
  quarters: { id: string; name: string; is_active: boolean }[];
  defaultQuarterId: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const location = getAdminLocation(pathname, ADMIN_NAV_LINKS);

  // The hub (and unknown paths) render their own header.
  if (!location) return null;

  const quarterParam = searchParams.get("quarter");
  const selectedQuarterId = resolveQuarterId(quarterParam, quarters, defaultQuarterId);
  const showPicker = !!location.page.quarterScoped && quarters.length > 0;

  return (
    <div className="space-y-3">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={ADMIN_HUB_HREF} className="hover:text-foreground">
          Admin
        </Link>
        <ChevronRight className="size-3.5" />
        <span>{location.areaLabel}</span>
        <ChevronRight className="size-3.5" />
        <span aria-current="page" className="font-medium text-foreground">
          {location.page.label}
        </span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {location.siblings.length > 1 ? (
          <div className="inline-flex w-fit items-center gap-[3px] rounded-lg bg-muted p-[3px]">
            {location.siblings.map((item) => {
              const active = item.href === location.page.href;
              return (
                <Link
                  key={item.href}
                  href={withQuarterParam(item.href, item.quarterScoped ? quarterParam : null)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                  {item.href === "/portal/admin/team-page" && pendingTeamCount > 0 && (
                    <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px]">{pendingTeamCount}</Badge>
                  )}
                </Link>
              );
            })}
          </div>
        ) : (
          <span />
        )}
        {showPicker && (
          <QuarterSelect quarters={quarters} selectedId={selectedQuarterId ?? ""} basePath={pathname} />
        )}
      </div>
    </div>
  );
}
