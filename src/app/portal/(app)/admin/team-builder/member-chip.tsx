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

// Deterministic per-person avatar tint, built from the app's existing brand
// tokens (green primary, warm terracotta, mint/accent) plus the blue/violet
// already used by the PM/SC candidate toggles below -- so a wall of chips
// reads as individuals rather than one repeated gray shape, without
// introducing any hue that isn't already part of this feature's palette.
const AVATAR_TINTS = [
  "bg-primary/15 text-primary",
  "bg-warm/15 text-warm",
  "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "bg-accent text-accent-foreground",
];

function avatarTint(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
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
  highlighted = false,
  onSetCandidate,
}: {
  profile: BoardProfile;
  dragging?: boolean;
  /** Finalized drafts are locked -- chips render but can't be dragged (candidate tags stay editable). */
  readOnly?: boolean;
  /** Set when this person matches an active search but is shown in place (e.g. already on a team) rather than filtered into a result list. */
  highlighted?: boolean;
  /** Team Builder-only PM/SC candidate tag; omit to hide the toggles (e.g. inside the DragOverlay). A person can hold both roles at once. */
  onSetCandidate?: (role: LeadCandidateRole, active: boolean) => void;
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
        "flex items-center gap-2 rounded-md border border-border/50 bg-card px-2 py-1.5 text-sm",
        readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        (isDragging || dragging) && "opacity-50",
        highlighted && "border-primary ring-2 ring-primary/50",
      )}
    >
      <Avatar className="size-6 shrink-0">
        <AvatarFallback className={cn("text-[10px] font-medium", avatarTint(profile.id))}>
          {initials(profile.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="leading-snug font-medium break-words">{profile.name}</p>
        <p className="text-[11px] leading-snug break-words text-muted-foreground">
          {roleLabel(profile.role)}
        </p>
      </div>
      {onSetCandidate && (
        <div className="flex shrink-0 items-center gap-1">
          <CandidateToggle
            label="P"
            title="Mark as PM candidate for next quarter (Team Builder only)"
            active={profile.candidateRoles.includes("pm")}
            activeClassName="bg-blue-600 text-white dark:bg-blue-500"
            onClick={() => onSetCandidate("pm", !profile.candidateRoles.includes("pm"))}
          />
          <CandidateToggle
            label="S"
            title="Mark as SC candidate for next quarter (Team Builder only)"
            active={profile.candidateRoles.includes("sc")}
            activeClassName="bg-violet-600 text-white dark:bg-violet-500"
            onClick={() => onSetCandidate("sc", !profile.candidateRoles.includes("sc"))}
          />
        </div>
      )}
    </div>
  );
}
