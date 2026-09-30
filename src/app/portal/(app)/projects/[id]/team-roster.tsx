"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, UserPlus } from "lucide-react";
import { addMember, removeMember } from "@/actions/projects";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabel } from "@/lib/auth/roles";
import type { Database } from "@/lib/supabase/database.types";
import type { MembershipWithProfile } from "@/lib/data/types";

type Profile = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "name" | "role">;

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TeamRoster({
  projectId,
  members,
  allProfiles,
  canEdit,
}: {
  projectId: string;
  members: MembershipWithProfile[];
  allProfiles: Profile[];
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [addValue, setAddValue] = useState("");
  const router = useRouter();

  const memberIds = new Set(members.map((m) => m.user_id));
  const addable = allProfiles.filter((p) => !memberIds.has(p.id));

  function onAdd(userId: string | null) {
    if (!userId) return;
    startTransition(async () => {
      const result = await addMember(projectId, userId);
      if (result?.error) toast.error(result.error);
      else {
        setAddValue("");
        router.refresh();
      }
    });
  }

  function onRemove(userId: string) {
    startTransition(async () => {
      const result = await removeMember(projectId, userId);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-full border py-1 pr-2 pl-1 text-sm"
            >
              <Avatar className="size-6">
                <AvatarFallback className="text-[10px]">
                  {m.profile ? initials(m.profile.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <span>{m.profile?.name ?? "Unknown"}</span>
              <span className="text-xs text-muted-foreground">
                {m.profile ? roleLabel(m.profile.role) : ""}
              </span>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remove ${m.profile?.name}`}
                  disabled={isPending}
                  onClick={() => onRemove(m.user_id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground">No team members yet.</p>
          )}
        </div>

        {canEdit && addable.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={addValue} onValueChange={onAdd}>
              <SelectTrigger size="sm" className="w-full sm:w-56">
                <UserPlus className="size-3.5" />
                <SelectValue placeholder="Add a member">
                  {(value: string) => addable.find((p) => p.id === value)?.name ?? "Add a member"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {addable.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
