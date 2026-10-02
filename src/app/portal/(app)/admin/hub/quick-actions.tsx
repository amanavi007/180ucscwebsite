import Link from "next/link";
import { CalendarPlus, Coffee, KeyRound, UserPlus, type LucideIcon } from "lucide-react";
import { withQuarterParam } from "@/lib/admin-nav";

interface QuickAction {
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
}

export function QuickActions({ quarterId }: { quarterId: string | null }) {
  const actions: QuickAction[] = [
    { label: "Add members", hint: "Bulk create accounts", href: "/portal/admin/members?action=bulk-add", icon: UserPlus },
    { label: "Reset a password", hint: "Find a member", href: "/portal/admin/members?action=find", icon: KeyRound },
    {
      label: "Add meeting day",
      hint: "Quarter calendar",
      href: withQuarterParam("/portal/admin/meeting-days", quarterId),
      icon: CalendarPlus,
    },
    {
      label: "Add coffee-chat slots",
      hint: "Recruitment schedule",
      href: "/portal/admin/coffee-chats?tab=schedule",
      icon: Coffee,
    },
  ];

  return (
    <section aria-labelledby="quick-actions-heading" className="space-y-2">
      <h2
        id="quick-actions-heading"
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Quick actions
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map(({ label, hint, href, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Icon className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
