import { QuarterSelect } from "@/components/quarter-select";
import { ADMIN_HUB_HREF } from "@/lib/admin-nav";

export function HubHeader({
  quarters,
  selectedId,
  subtitle,
}: {
  quarters: { id: string; name: string; is_active: boolean }[];
  selectedId: string | null;
  subtitle: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {quarters.length > 0 && (
          <QuarterSelect quarters={quarters} selectedId={selectedId ?? ""} basePath={ADMIN_HUB_HREF} />
        )}
      </div>
    </div>
  );
}
