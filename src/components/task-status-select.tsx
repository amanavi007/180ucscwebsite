"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_STATUS_LABELS, TASK_STATUS_BADGE_CLASS } from "@/lib/project-labels";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/supabase/database.types";

/** A status Select styled to read as its own colored badge, matching TASK_STATUS_BADGE_CLASS. */
export function TaskStatusSelect({
  value,
  onValueChange,
  disabled,
  className,
}: {
  value: TaskStatus;
  onValueChange: (value: TaskStatus) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v && onValueChange(v as TaskStatus)}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        className={cn("w-fit border-transparent", TASK_STATUS_BADGE_CLASS[value], className)}
      >
        <SelectValue>{(v: TaskStatus) => TASK_STATUS_LABELS[v]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(TASK_STATUS_LABELS).map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
