"use client";

import { useDraggable } from "@dnd-kit/core";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { roleLabel } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { BoardProfile } from "@/lib/data/team-builder";
import type { LeadCandidateRole } from "@/lib/supabase/database.types";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function CandidateToggle({
  label,
  title,
  active,
  activeClassName,
  onClick,
}: {
  label: string;
  title: string;
  active: boolean;
  activeClassName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      // Stop the drag sensor from ever seeing this click as a drag attempt.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold transition-colors",
        active ? activeClassName : "bg-muted text-muted-foreground/70 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function MemberChip({
  profile,
  dragging = false,
  readOnly = false,
  onSetCandidate,
}: {
  profile: BoardProfile;
  dragging?: boolean;
  /** Finalized drafts are locked -- chips render but can't be dragged (candidate tags stay editable). */
  readOnly?: boolean;
  /** Team Builder-only PM/SC candidate tag; omit to hide the toggles (e.g. inside the DragOverlay). */
  onSetCandidate?: (role: LeadCandidateRole | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: profile.id,
    data: profile,
    disabled: readOnly,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm",
        readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        (isDragging || dragging) && "opacity-50",
      )}
    >
      <Avatar className="size-6">
        <AvatarFallback className="text-[10px]">{initials(profile.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate leading-none font-medium">{profile.name}</p>
        <p className="truncate text-[11px] leading-none text-muted-foreground">
          {roleLabel(profile.role)}
        </p>
      </div>
      {onSetCandidate && (
        <div className="flex shrink-0 items-center gap-1">
          <CandidateToggle
            label="P"
            title="Mark as PM candidate for next quarter (Team Builder only)"
            active={profile.candidateRole === "pm"}
            activeClassName="bg-blue-600 text-white dark:bg-blue-500"
            onClick={() => onSetCandidate(profile.candidateRole === "pm" ? null : "pm")}
          />
          <CandidateToggle
            label="S"
            title="Mark as SC candidate for next quarter (Team Builder only)"
            active={profile.candidateRole === "sc"}
            activeClassName="bg-violet-600 text-white dark:bg-violet-500"
            onClick={() => onSetCandidate(profile.candidateRole === "sc" ? null : "sc")}
          />
        </div>
      )}
    </div>
  );
}
