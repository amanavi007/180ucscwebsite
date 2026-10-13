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
  const quarterParam = searchParams.get("quarter");

  // Unknown paths render their own header.
  if (!location) return null;

  const selectedQuarterId = resolveQuarterId(quarterParam, quarters, defaultQuarterId);
  const showPicker = !!location.page.quarterScoped && quarters.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href={withQuarterParam(ADMIN_HUB_HREF, quarterParam)} className="hover:text-foreground">
            Admin
          </Link>
          <ChevronRight className="size-3.5" />
          <span aria-current="page" className="font-semibold text-foreground">
            {location.areaLabel}
          </span>
        </nav>
        {showPicker && (
          <QuarterSelect quarters={quarters} selectedId={selectedQuarterId ?? ""} basePath={pathname} />
        )}
      </div>

      {location.siblings.length > 1 && (
        <div role="navigation" aria-label={`${location.areaLabel} views`} className="inline-flex w-fit flex-wrap items-center gap-1 rounded-full bg-muted p-1">
          {location.siblings.map((item) => {
            const active = item.href === location.page.href;
            return (
              <Link
                key={item.href}
                href={withQuarterParam(item.href, item.quarterScoped ? quarterParam : null)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-foreground font-bold text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.viewLabel ?? item.label}
                {item.href === "/portal/admin/team-page" && pendingTeamCount > 0 && (
                  <Badge className="ml-2 h-5 min-w-5 px-1.5">{pendingTeamCount}</Badge>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
