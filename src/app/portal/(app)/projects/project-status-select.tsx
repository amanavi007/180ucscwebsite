"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateProjectStatus } from "@/actions/projects";
import { PROJECT_STATUSES, statusLabel } from "@/lib/project-labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectStatus } from "@/lib/supabase/database.types";

export function ProjectStatusSelect({
  projectId,
  status,
  disabled,
}: {
  projectId: string;
  status: ProjectStatus;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function onChange(value: string | null) {
    if (!value) return;
    startTransition(async () => {
      const result = await updateProjectStatus(projectId, value as ProjectStatus);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={disabled || isPending}>
      <SelectTrigger size="sm" className="w-full" onClick={(e) => e.stopPropagation()}>
        <SelectValue>{(value: ProjectStatus) => statusLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {PROJECT_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {statusLabel(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
