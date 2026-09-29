"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  deleteSlotAction,
  generateSlotsAction,
  getExecOptionsForSlotAction,
  publishSlotAction,
  swapSlotExecAction,
} from "@/actions/coffee-chat";
import type { SlotRow } from "@/lib/data/coffee-chat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function SwapControl({ slot, position, router }: { slot: SlotRow; position: "exec_id_1" | "exec_id_2"; router: ReturnType<typeof useRouter> }) {
  const [isPending, startTransition] = useTransition();
  const [options, setOptions] = useState<{ id: string; name: string }[] | null>(null);

  async function loadOptions() {
    if (options) return;
    const result = await getExecOptionsForSlotAction(slot.date, slot.startTime, slot.endTime);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setOptions(result.options);
  }

  function handleSwap(newExecId: string | null) {
    if (!newExecId) return;
    startTransition(async () => {
      const result = await swapSlotExecAction(slot.id, position, newExecId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Swapped.");
      router.refresh();
    });
  }

  const currentName = position === "exec_id_1" ? slot.exec1Name : slot.exec2Name;

  return (
    <Select onOpenChange={(open) => open && loadOptions()} onValueChange={handleSwap} disabled={isPending}>
      <SelectTrigger className="h-7 w-36 text-xs">
        <SelectValue placeholder={currentName ?? "Unassigned"}>{currentName ?? "Unassigned"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(options ?? []).map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SlotsView({ slots, currentExecId }: { slots: SlotRow[]; currentExecId: string }) {
  const [isPending, startTransition] = useTransition();
  const [mineOnly, setMineOnly] = useState(false);
  const router = useRouter();

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateSlotsAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Generated ${result.createdCount ?? 0} new slot(s).`);
      router.refresh();
    });
  }

  function handlePublishToggle(slotId: string, published: boolean) {
    startTransition(async () => {
      const result = await publishSlotAction(slotId, published);
      if (result.error) toast.error(result.error);
      router.refresh();
    });
  }

  function handleDelete(slotId: string) {
    startTransition(async () => {
      const result = await deleteSlotAction(slotId);
      if (result.error) toast.error(result.error);
      router.refresh();
    });
  }

  const visible = mineOnly ? slots.filter((s) => s.execId1 === currentExecId || s.execId2 === currentExecId) : slots;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Checkbox id="mine-only" checked={mineOnly} onCheckedChange={(c) => setMineOnly(c === true)} />
          <label htmlFor="mine-only" className="text-sm text-muted-foreground">
            My slots only
          </label>
        </div>
        <Button onClick={handleGenerate} disabled={isPending} className="gap-1.5">
          <RefreshCw className="size-4" />
          Generate slots
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No slots yet -- add availability, then generate.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Exec 1</TableHead>
              <TableHead>Exec 2</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((slot) => (
              <TableRow key={slot.id}>
                <TableCell>{slot.date}</TableCell>
                <TableCell>
                  {slot.startTime}–{slot.endTime}
                </TableCell>
                <TableCell>
                  <SwapControl slot={slot} position="exec_id_1" router={router} />
                </TableCell>
                <TableCell>
                  <SwapControl slot={slot} position="exec_id_2" router={router} />
                </TableCell>
                <TableCell>
                  <Badge variant={slot.bookingStatus === "booked" ? "default" : "secondary"}>
                    {slot.bookingStatus === "booked" ? `Booked (${slot.applicantName})` : "Open"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={slot.published}
                    onCheckedChange={(c) => handlePublishToggle(slot.id, c === true)}
                    disabled={isPending}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(slot.id)}
                    disabled={isPending || slot.bookingStatus === "booked"}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
