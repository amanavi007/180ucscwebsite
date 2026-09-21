"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, CheckCircle2 } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { format } from "date-fns";
import {
  applyPlan,
  assignInPlan,
  createPlanTeam,
  finalizePlan,
  setLeadCandidate,
  unassignInPlan,
  unfinalizePlan,
} from "@/actions/team-builder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListSearch } from "@/components/list-search";
import { useFilteredList } from "@/lib/use-filtered-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropZone } from "./drop-zone";
import { MemberChip } from "./member-chip";
import { TeamColumn } from "./team-column";
import type { BoardProfile, BoardTeam, PlanSummary, TeamBuilderBoard as Board } from "@/lib/data/team-builder";
import type { LeadCandidateRole } from "@/lib/supabase/database.types";

type DropTarget =
  | { type: "unassigned" }
  | { type: "team"; planTeamId: string; role: "pm" | "sc" | "member" };

function parseZoneId(id: string): DropTarget | null {
  if (id === "unassigned") return { type: "unassigned" };
  const match = /^team:(.+):(pm|sc|member)$/.exec(id);
  if (!match) return null;
  return { type: "team", planTeamId: match[1], role: match[2] as "pm" | "sc" | "member" };
}

function findProfile(board: Board, userId: string): BoardProfile | null {
  const inPool = board.unassigned.find((p) => p.id === userId);
  if (inPool) return inPool;
  for (const t of board.teams) {
    const found = t.pm.find((p) => p.id === userId) ?? t.sc.find((p) => p.id === userId) ?? t.members.find((p) => p.id === userId);
    if (found) return found;
  }
  return null;
}

function currentTargetFor(board: Board, userId: string): DropTarget | null {
  if (board.unassigned.some((p) => p.id === userId)) return { type: "unassigned" };
  for (const t of board.teams) {
    if (t.pm.some((p) => p.id === userId)) return { type: "team", planTeamId: t.id, role: "pm" };
    if (t.sc.some((p) => p.id === userId)) return { type: "team", planTeamId: t.id, role: "sc" };
    if (t.members.some((p) => p.id === userId))
      return { type: "team", planTeamId: t.id, role: "member" };
  }
  return null;
}

function sameTarget(a: DropTarget | null, b: DropTarget): boolean {
  if (!a) return false;
  if (a.type === "unassigned" && b.type === "unassigned") return true;
  if (a.type === "team" && b.type === "team")
    return a.planTeamId === b.planTeamId && a.role === b.role;
  return false;
}

function removeEverywhere(board: Board, userId: string): Board {
  return {
    unassigned: board.unassigned.filter((p) => p.id !== userId),
    teams: board.teams.map((t) => ({
      ...t,
      pm: t.pm.filter((p) => p.id !== userId),
      sc: t.sc.filter((p) => p.id !== userId),
      members: t.members.filter((p) => p.id !== userId),
    })),
  };
}

function insertInto(board: Board, profile: BoardProfile, target: DropTarget): Board {
  if (target.type === "unassigned") {
    return { ...board, unassigned: [...board.unassigned, profile] };
  }
  return {
    ...board,
    teams: board.teams.map((t: BoardTeam): BoardTeam => {
      if (t.id !== target.planTeamId) return t;
      if (target.role === "pm") return { ...t, pm: [...t.pm, profile] };
      if (target.role === "sc") return { ...t, sc: [...t.sc, profile] };
      return { ...t, members: [...t.members, profile] };
    }),
  };
}

function setCandidateEverywhere(board: Board, userId: string, role: LeadCandidateRole | null): Board {
  const patch = (p: BoardProfile) => (p.id === userId ? { ...p, candidateRole: role } : p);
  return {
    unassigned: board.unassigned.map(patch),
    teams: board.teams.map((t) => ({
      ...t,
      pm: t.pm.map(patch),
      sc: t.sc.map(patch),
      members: t.members.map(patch),
    })),
  };
}

export function TeamBuilderBoard({
  quarterId,
  plan,
  board: initialBoard,
}: {
  quarterId: string;
  plan: PlanSummary;
  board: Board;
}) {
  // `useState(initialBoard)` only seeds on mount -- this component keeps the
  // same key/instance across a create/rename/delete team action, so without
  // re-syncing here, `router.refresh()` re-fetches the board server-side but
  // the new `initialBoard` prop never makes it into local state, and the
  // change doesn't show up until a full page reload. Drag-and-drop and
  // candidate tagging avoided this by patching `board` optimistically before
  // the request even goes out; this covers everything else (create/rename/
  // delete team) that only calls router.refresh() on success. Adjusting state
  // during render (rather than in a useEffect) avoids an extra render pass.
  const [prevInitialBoard, setPrevInitialBoard] = useState(initialBoard);
  const [board, setBoard] = useState(initialBoard);
  if (initialBoard !== prevInitialBoard) {
    setPrevInitialBoard(initialBoard);
    setBoard(initialBoard);
  }
  const [activeProfile, setActiveProfile] = useState<BoardProfile | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [isCreating, startCreating] = useTransition();
  const [isFinalizing, startFinalizing] = useTransition();
  const [isApplying, startApplying] = useTransition();
  const [isUnfinalizing, startUnfinalizing] = useTransition();
  const router = useRouter();

  const readOnly = plan.isFinalized;

  const { query: unassignedQuery, setQuery: setUnassignedQuery, filtered: visibleUnassigned } =
    useFilteredList(board.unassigned, ["name"]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragStart(event: DragStartEvent) {
    if (readOnly) return;
    setActiveProfile(findProfile(board, String(event.active.id)));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveProfile(null);
    if (readOnly) return;
    const { active, over } = event;
    if (!over) return;

    const userId = String(active.id);
    const target = parseZoneId(String(over.id));
    if (!target) return;

    const profile = findProfile(board, userId);
    if (!profile) return;

    if (sameTarget(currentTargetFor(board, userId), target)) return;

    setBoard(insertInto(removeEverywhere(board, userId), profile, target));

    startTransition(async () => {
      const result =
        target.type === "unassigned"
          ? await unassignInPlan(userId, plan.id)
          : await assignInPlan(userId, plan.id, target.planTeamId, target.role);
      if (result?.error) {
        toast.error(result.error);
        router.refresh();
      }
    });
  }

  function handleSetCandidate(userId: string, role: LeadCandidateRole | null) {
    setBoard(setCandidateEverywhere(board, userId, role));
    startTransition(async () => {
      const result = await setLeadCandidate(userId, quarterId, role);
      if (result?.error) {
        toast.error(result.error);
        router.refresh();
      }
    });
  }

  function onCreateTeam() {
    if (!newTeamName.trim()) return;
    startCreating(async () => {
      const result = await createPlanTeam(plan.id, newTeamName);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setNewTeamName("");
      setAddOpen(false);
      router.refresh();
    });
  }

  function onFinalize() {
    startFinalizing(async () => {
      const result = await finalizePlan(plan.id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft locked. Use Apply when you're ready to write it to the real rosters.");
      router.refresh();
    });
  }

  function onApply() {
    startApplying(async () => {
      const result = await applyPlan(plan.id);
      if (result?.error) {
        toast.error(result.error);
        setApplyOpen(false);
        return;
      }
      toast.success("Applied -- live rosters updated.");
      setApplyOpen(false);
      router.refresh();
    });
  }

  function onUnfinalize() {
    startUnfinalizing(async () => {
      const result = await unfinalizePlan(plan.id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft unlocked -- editable again.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {readOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-primary" />
            Finalized{plan.finalizedAt ? ` on ${format(new Date(plan.finalizedAt), "MMM d, yyyy")}` : ""} --
            this draft is read-only. Apply writes it to the real team rosters.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onUnfinalize} disabled={isUnfinalizing}>
              Unfinalize
            </Button>
            <Button onClick={() => setApplyOpen(true)} disabled={isApplying} className="gap-1.5">
              <CheckCircle2 className="size-4" />
              Apply
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button onClick={onFinalize} disabled={isFinalizing} className="gap-1.5">
            <CheckCircle2 className="size-4" />
            Finalize
          </Button>
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex items-start gap-4">
          <Card className="w-64 shrink-0">
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b py-3">
              <CardTitle className="text-base">Unassigned</CardTitle>
              <Badge variant="secondary">{board.unassigned.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              <ListSearch
                value={unassignedQuery}
                onChange={setUnassignedQuery}
                placeholder="Search..."
              />
              <DropZone
                id="unassigned"
                placeholder={
                  board.unassigned.length === 0
                    ? "Everyone's placed"
                    : visibleUnassigned.length === 0
                      ? "No matches"
                      : undefined
                }
              >
                {visibleUnassigned.map((p) => (
                  <MemberChip
                    key={p.id}
                    profile={p}
                    readOnly={readOnly}
                    onSetCandidate={(role) => handleSetCandidate(p.id, role)}
                  />
                ))}
              </DropZone>
            </CardContent>
          </Card>

          <div className="flex flex-1 flex-wrap items-start gap-4">
            {board.teams.map((team) => (
              <TeamColumn
                key={team.id}
                team={team}
                readOnly={readOnly}
                onSetCandidate={handleSetCandidate}
              />
            ))}

            {!readOnly && (
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger
                  render={
                    <Button variant="outline" className="h-10 w-56 shrink-0 gap-1.5">
                      <Plus className="size-4" />
                      Add team
                    </Button>
                  }
                />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New team</DialogTitle>
                  </DialogHeader>
                  <Input
                    autoFocus
                    placeholder="Client name"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onCreateTeam()}
                    disabled={isCreating}
                  />
                  <DialogFooter>
                    <Button onClick={onCreateTeam} disabled={isCreating || !newTeamName.trim()}>
                      Create
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <DragOverlay>{activeProfile && <MemberChip profile={activeProfile} dragging />}</DragOverlay>
      </DndContext>

      <AlertDialog open={applyOpen} onOpenChange={setApplyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply &quot;{plan.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This overwrites the live team rosters for this quarter to match this draft exactly.
              Anyone left in Unassigned here will be removed from their real team. Teams are matched
              to existing ones by name; new teams are created for any that don&apos;t match. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isApplying} onClick={onApply}>
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
