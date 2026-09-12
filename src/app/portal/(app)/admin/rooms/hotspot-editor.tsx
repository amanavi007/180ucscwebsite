"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { updateRoomHotspots } from "@/actions/room-hotspots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ROOM_MAP_IMAGE,
  ROOM_MAP_IMAGE_WIDTH,
  ROOM_MAP_IMAGE_HEIGHT,
} from "@/lib/rooms";
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
import type { RoomHotspot } from "@/lib/data/room-hotspots";

/** A hotspot being edited. `id` is absent for one added in this session that hasn't been saved yet. */
interface DraftHotspot {
  key: string;
  id?: string;
  name: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

const MIN_SIZE = 2;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), Math.max(min, max));
}

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `new-${Date.now()}-${Math.random()}`;
}

export function HotspotEditor({
  hotspots,
  onCancel,
  onSaved,
}: {
  hotspots: RoomHotspot[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<DraftHotspot[]>(() =>
    hotspots.map((h) => ({
      key: h.id,
      id: h.id,
      name: h.name,
      top: h.top,
      left: h.left,
      width: h.width,
      height: h.height,
    })),
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    key: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    start: DraftHotspot;
  } | null>(null);

  const selected = draft.find((h) => h.key === selectedKey) ?? null;
  const pendingDelete = draft.find((h) => h.key === pendingDeleteKey) ?? null;

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    const container = mapRef.current;
    if (!drag || !container) return;
    const rect = container.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;

    setDraft((prev) =>
      prev.map((h) => {
        if (h.key !== drag.key) return h;
        if (drag.mode === "move") {
          return {
            ...h,
            top: round2(clamp(drag.start.top + dyPct, 0, 100 - drag.start.height)),
            left: round2(clamp(drag.start.left + dxPct, 0, 100 - drag.start.width)),
          };
        }
        return {
          ...h,
          width: round2(clamp(drag.start.width + dxPct, MIN_SIZE, 100 - drag.start.left)),
          height: round2(clamp(drag.start.height + dyPct, MIN_SIZE, 100 - drag.start.top)),
        };
      }),
    );
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
  }, [handlePointerMove]);

  // Clean up window listeners if the editor unmounts mid-drag.
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  function startDrag(e: React.PointerEvent, key: string, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    const h = draft.find((d) => d.key === key);
    if (!h) return;
    setSelectedKey(key);
    dragRef.current = { key, mode, startX: e.clientX, startY: e.clientY, start: h };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function addHotspot() {
    const key = newKey();
    setDraft((prev) => [...prev, { key, name: "", top: 40, left: 40, width: 10, height: 5 }]);
    setSelectedKey(key);
  }

  function updateSelected(patch: Partial<DraftHotspot>) {
    setDraft((prev) => prev.map((h) => (h.key === selectedKey ? { ...h, ...patch } : h)));
  }

  function confirmDelete() {
    if (!pendingDeleteKey) return;
    setDraft((prev) => prev.filter((h) => h.key !== pendingDeleteKey));
    if (selectedKey === pendingDeleteKey) setSelectedKey(null);
    setPendingDeleteKey(null);
  }

  function handleSave() {
    if (draft.some((h) => !h.name.trim())) {
      toast.error("Every room needs a name.");
      return;
    }
    startSaveTransition(async () => {
      const result = await updateRoomHotspots(
        draft.map((h) => ({
          id: h.id,
          name: h.name.trim(),
          top: h.top,
          left: h.left,
          width: h.width,
          height: h.height,
        })),
      );
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Room map saved.");
      onSaved();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Drag a room to move it, drag its bottom-right handle to resize, or click it to edit
          precisely below.
        </p>
        <div className="flex gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={addHotspot}>
            <Plus />
            Add room
          </Button>
        </div>
      </div>

      <div
        ref={mapRef}
        className="relative mx-auto w-full max-w-md touch-none overflow-hidden rounded-lg border bg-white select-none"
        style={{ aspectRatio: `${ROOM_MAP_IMAGE_WIDTH} / ${ROOM_MAP_IMAGE_HEIGHT}` }}
      >
        <Image
          src={ROOM_MAP_IMAGE}
          alt="SNE Library upper level floor plan"
          fill
          sizes="(max-width: 640px) 100vw, 448px"
          className="pointer-events-none object-contain select-none"
          priority
        />
        {draft.map((h) => {
          const isSelected = h.key === selectedKey;
          return (
            <div
              key={h.key}
              onPointerDown={(e) => startDrag(e, h.key, "move")}
              className={cn(
                "absolute flex cursor-move items-center justify-center rounded-[3px] border-2 border-dashed bg-primary/10 text-[10px] font-semibold",
                isSelected ? "border-primary bg-primary/20" : "border-muted-foreground/50",
              )}
              style={{
                top: `${h.top}%`,
                left: `${h.left}%`,
                width: `${h.width}%`,
                height: `${h.height}%`,
              }}
            >
              {h.name || "(unnamed)"}
              {isSelected && (
                <div
                  onPointerDown={(e) => startDrag(e, h.key, "resize")}
                  className="absolute right-0 bottom-0 size-3 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-full border-2 border-background bg-primary"
                  aria-label={`Resize ${h.name || "room"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {draft.map((h) => (
          <button
            key={h.key}
            type="button"
            onClick={() => setSelectedKey(h.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              h.key === selectedKey
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            {h.name || "(unnamed)"}
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          <div className="flex items-center gap-2">
            <Input
              value={selected.name}
              onChange={(e) => updateSelected({ name: e.target.value })}
              placeholder="Room name"
              className="h-8 max-w-40"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              className="ml-auto"
              onClick={() => setPendingDeleteKey(selected.key)}
              aria-label={`Remove ${selected.name || "room"}`}
            >
              <Trash2 />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["top", "Top %"],
                ["left", "Left %"],
                ["width", "Width %"],
                ["height", "Height %"],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {label}
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={selected[field]}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isNaN(value)) return;
                    updateSelected({ [field]: value });
                  }}
                  className="h-8"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={isSaving}>
          Save changes
        </Button>
      </div>

      <AlertDialog
        open={!!pendingDeleteKey}
        onOpenChange={(open) => !open && setPendingDeleteKey(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.name || "this room"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This only takes effect once you save. Existing room bookings that reference this
              room name are left as-is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
