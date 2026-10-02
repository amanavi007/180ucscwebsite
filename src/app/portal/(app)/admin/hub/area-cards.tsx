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
    <section aria-labelledby="areas-heading" className="space-y-2">
      <h2
        id="areas-heading"
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Browse by area
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(ADMIN_AREA_LABELS).map(([areaKey, areaLabel]) => (
          <div key={areaKey} className="rounded-lg border p-4">
            <h3 className="text-sm font-semibold">{areaLabel}</h3>
            <ul className="mt-2 space-y-1">
              {ADMIN_NAV_LINKS.filter((l) => l.group === areaKey).map((link) => (
                <li key={link.href}>
                  <Link
                    href={withQuarterParam(link.href, link.quarterScoped ? quarterId : null)}
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
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
