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

// Avatar tint now follows the chip's role in its current section (PM/SC get
// a quiet brand-color wash, everyone else stays neutral) instead of a
// per-person hash across five rotating hues -- a wall of chips read as
// visual noise more than as individuals, and the flat neutral default lets
// the PM/SC tint actually mean something when it does show up.
const AVATAR_TINT: Record<"pm" | "sc" | "neutral", string> = {
  pm: "bg-accent text-accent-foreground",
  sc: "bg-warm/15 text-warm",
  neutral: "bg-muted text-muted-foreground",
};

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
        "flex h-5 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold transition-all",
        active
          ? cn("border px-1.5", activeClassName)
          : "w-0 border border-transparent px-0 text-muted-foreground/60 opacity-0 group-hover:w-5 group-hover:px-1.5 group-hover:opacity-100 focus-visible:w-5 focus-visible:px-1.5 focus-visible:opacity-100 hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function MemberChip({
  profile,
  variant = "neutral",
  dragging = false,
  readOnly = false,
  highlighted = false,
  onSetCandidate,
}: {
  profile: BoardProfile;
  /** Which section this chip currently sits in -- tints the avatar so PM/SC read at a glance without a filled background block behind the whole row. */
  variant?: "pm" | "sc" | "neutral";
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
        "group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
        readOnly ? "cursor-default" : "cursor-grab hover:bg-foreground/[0.03] active:cursor-grabbing",
        (isDragging || dragging) && "opacity-50",
        highlighted && "bg-primary/5 ring-2 ring-primary/50",
      )}
    >
      <Avatar className="size-7 shrink-0">
        <AvatarFallback className={cn("text-[10px] font-medium", AVATAR_TINT[variant])}>
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
            activeClassName="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300"
            onClick={() => onSetCandidate("pm", !profile.candidateRoles.includes("pm"))}
          />
          <CandidateToggle
            label="S"
            title="Mark as SC candidate for next quarter (Team Builder only)"
            active={profile.candidateRoles.includes("sc")}
            activeClassName="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300"
            onClick={() => onSetCandidate("sc", !profile.candidateRoles.includes("sc"))}
          />
        </div>
      )}
    </div>
  );
}
