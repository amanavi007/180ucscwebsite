import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ADMIN_NAV_LINKS } from "@/components/layout/nav-links";
import { ADMIN_AREA_LABELS, withQuarterParam } from "@/lib/admin-nav";

export function AreaCards({
  quarterId,
  pendingTeamCount,
}: {
  quarterId: string | null;
  pendingTeamCount: number;
}) {
  return (
    <section aria-labelledby="areas-heading" className="space-y-3">
      <h2
        id="areas-heading"
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Browse by area
      </h2>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(ADMIN_AREA_LABELS).map(([areaKey, areaLabel]) => (
          <div key={areaKey}>
            <h3 className="border-b-2 border-primary pb-1.5 text-sm font-semibold">{areaLabel}</h3>
            <ul className="mt-2">
              {ADMIN_NAV_LINKS.filter((l) => l.group === areaKey).map((link) => (
                <li key={link.href}>
                  <Link
                    href={withQuarterParam(link.href, link.quarterScoped ? quarterId : null)}
                    className="flex items-center py-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {link.label}
                    {link.href === "/portal/admin/team-page" && pendingTeamCount > 0 && (
                      <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px]">{pendingTeamCount}</Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
