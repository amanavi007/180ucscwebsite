import { Badge } from "@/components/ui/badge";
import { HEALTH_BADGE_CLASS, HEALTH_LABELS } from "@/lib/project-labels";
import type { ProjectHealth } from "@/lib/supabase/database.types";

export function HealthBadge({ health }: { health: ProjectHealth }) {
  return (
    <Badge variant="outline" className={HEALTH_BADGE_CLASS[health]}>
      {HEALTH_LABELS[health]}
    </Badge>
  );
}
