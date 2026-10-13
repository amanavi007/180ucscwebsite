import Link from "next/link";
import { CalendarPlus, Coffee, KeyRound, UserPlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withQuarterParam } from "@/lib/admin-nav";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

export function QuickActions({ quarterId }: { quarterId: string | null }) {
  const actions: QuickAction[] = [
    { label: "Add members", href: "/portal/admin/members?action=bulk-add", icon: UserPlus },
    { label: "Reset a password", href: "/portal/admin/members?action=find", icon: KeyRound },
    { label: "Add a meeting day", href: withQuarterParam("/portal/admin/meeting-days", quarterId), icon: CalendarPlus },
    { label: "Add availability", href: "/portal/admin/scheduling", icon: Coffee },
  ];

  return (
    <section aria-labelledby="quick-actions-heading" className="space-y-3">
      <h2 id="quick-actions-heading" className="text-lg">
        Quick actions
      </h2>
      <div className="flex flex-wrap gap-2.5">
        {actions.map(({ label, href, icon: Icon }) => (
          <Button key={label} variant="outline" nativeButton={false} render={<Link href={href} />}>
            <Icon />
            {label}
          </Button>
        ))}
      </div>
    </section>
  );
}
