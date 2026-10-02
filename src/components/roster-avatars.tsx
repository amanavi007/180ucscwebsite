import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import type { MembershipWithProfile } from "@/lib/data/types";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Small overlapping avatar cluster for a team roster, capped with a "+N" overflow. */
export function RosterAvatars({
  members,
  max = 5,
}: {
  members: MembershipWithProfile[];
  max?: number;
}) {
  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;

  return (
    <AvatarGroup>
      {shown.map((m) => (
        <Avatar key={m.id} size="sm" title={m.profile?.name ?? "Unknown"}>
          <AvatarFallback>{m.profile ? initials(m.profile.name) : "?"}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <AvatarGroupCount className="size-6 text-xs">+{overflow}</AvatarGroupCount>
      )}
    </AvatarGroup>
  );
}
