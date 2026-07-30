"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, X } from "lucide-react";
import { setRoomBooking } from "@/actions/room-bookings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ROOM_HOTSPOTS,
  ROOM_MAP_IMAGE,
  ROOM_MAP_IMAGE_WIDTH,
  ROOM_MAP_IMAGE_HEIGHT,
} from "@/lib/rooms";
import type { RoomBooking } from "@/lib/data/room-bookings";

const TEAM_COLORS = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#4f46e5",
  "#ea580c",
];

export function RoomMap({ date, teams }: { date: string; teams: RoomBooking[] }) {
  const [activeId, setActiveId] = useState<string | null>(
    teams.find((t) => t.roomName === null)?.projectId ?? teams[0]?.projectId ?? null,
  );
  const [customValue, setCustomValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const colorByTeam = useMemo(() => {
    const map = new Map<string, string>();
    teams.forEach((t, i) => map.set(t.projectId, TEAM_COLORS[i % TEAM_COLORS.length]));
    return map;
  }, [teams]);

  const teamsByRoom = useMemo(() => {
    const map = new Map<string, RoomBooking[]>();
    for (const t of teams) {
      if (!t.roomName) continue;
      map.set(t.roomName, [...(map.get(t.roomName) ?? []), t]);
    }
    return map;
  }, [teams]);

  const activeTeam = teams.find((t) => t.projectId === activeId) ?? null;

  /** After assigning a room, jump to the next team that still needs one. */
  function advanceToNext(currentId: string) {
    const idx = teams.findIndex((t) => t.projectId === currentId);
    for (let i = 1; i <= teams.length; i++) {
      const candidate = teams[(idx + i) % teams.length];
      if (candidate.projectId !== currentId && candidate.roomName === null) {
        setActiveId(candidate.projectId);
        return;
      }
    }
    setActiveId(null);
  }

  function save(projectId: string, roomName: string | null, advance: boolean) {
    startTransition(async () => {
      const result = await setRoomBooking(projectId, date, roomName);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      if (advance) advanceToNext(projectId);
    });
  }

  function handleHotspotClick(roomName: string) {
    if (!activeTeam) {
      const occupant = teamsByRoom.get(roomName)?.[0];
      if (occupant) setActiveId(occupant.projectId);
      return;
    }
    const assigning = activeTeam.roomName !== roomName;
    save(activeTeam.projectId, assigning ? roomName : null, assigning);
  }

  if (teams.length === 0) {
    return <p className="text-sm text-muted-foreground">No teams in this quarter yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {teams.map((t) => {
          const color = colorByTeam.get(t.projectId)!;
          const active = t.projectId === activeId;
          const collides = !!t.roomName && (teamsByRoom.get(t.roomName)?.length ?? 0) > 1;
          return (
            <button
              key={t.projectId}
              type="button"
              onClick={() => setActiveId(active ? null : t.projectId)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-transparent text-white"
                  : "border-border bg-background hover:bg-muted",
              )}
              style={active ? { backgroundColor: color } : undefined}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: active ? "white" : color }}
              />
              {t.clientName}
              <span
                className={cn("font-normal", active ? "text-white/80" : "text-muted-foreground")}
              >
                {t.roomName ? `· ${t.roomName}` : "· Unassigned"}
              </span>
              {collides && (
                <AlertTriangle className={cn("size-3", active ? "text-white" : "text-amber-500")} />
              )}
            </button>
          );
        })}
      </div>

      {activeTeam && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: colorByTeam.get(activeTeam.projectId) }}
          />
          <span className="font-medium">{activeTeam.clientName}</span>
          <span className="text-muted-foreground">
            {activeTeam.roomName
              ? `is in ${activeTeam.roomName}`
              : "has no room yet -- click one on the map"}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Input
              placeholder="Other room..."
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customValue.trim()) {
                  save(activeTeam.projectId, customValue.trim(), true);
                  setCustomValue("");
                }
              }}
              disabled={isPending}
              className="h-7 w-36"
            />
            {activeTeam.roomName && (
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isPending}
                onClick={() => save(activeTeam.projectId, null, false)}
                aria-label="Clear room"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      <div
        className="relative mx-auto w-full max-w-md overflow-hidden rounded-lg border bg-white"
        style={{ aspectRatio: `${ROOM_MAP_IMAGE_WIDTH} / ${ROOM_MAP_IMAGE_HEIGHT}` }}
      >
        <Image
          src={ROOM_MAP_IMAGE}
          alt="SNE Library upper level floor plan"
          fill
          sizes="(max-width: 640px) 100vw, 448px"
          className="object-contain select-none"
          priority
        />
        {ROOM_HOTSPOTS.map((spot) => {
          const occupants = teamsByRoom.get(spot.name) ?? [];
          const isActiveRoom = activeTeam?.roomName === spot.name;
          const color = occupants[0] ? colorByTeam.get(occupants[0].projectId) : undefined;
          return (
            <button
              key={spot.name}
              type="button"
              onClick={() => handleHotspotClick(spot.name)}
              disabled={isPending}
              aria-label={`Room ${spot.name}${occupants.length ? ` -- ${occupants.map((o) => o.clientName).join(", ")}` : " -- unassigned"}`}
              title={
                occupants.length > 0
                  ? occupants.map((o) => o.clientName).join(", ")
                  : `Room ${spot.name} -- unassigned`
              }
              className={cn(
                "absolute flex items-center justify-center gap-0.5 rounded-[3px] border-2 text-[10px] font-semibold text-white transition-colors",
                occupants.length > 0
                  ? "border-transparent"
                  : "border-dashed border-muted-foreground/40 bg-transparent hover:border-primary",
                isActiveRoom && "ring-2 ring-offset-1 ring-foreground",
              )}
              style={{
                top: `${spot.top}%`,
                left: `${spot.left}%`,
                width: `${spot.width}%`,
                height: `${spot.height}%`,
                backgroundColor: occupants.length > 0 ? color : undefined,
              }}
            >
              {occupants.length > 0 && spot.name}
              {occupants.length > 1 && <AlertTriangle className="size-2.5 text-amber-300" />}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Click a team above, then click its room on the map. Click the same room again to clear it,
        or use &quot;Other&quot; for a room not shown here.
      </p>
    </div>
  );
}
