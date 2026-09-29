"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { addAvailabilityEntryAction, removeAvailabilityBlockAction } from "@/actions/coffee-chat";
import type { AvailabilityRow } from "@/lib/data/coffee-chat";
import { formatTime12h } from "@/lib/coffee-chat";
import { formatDateLong, toDateString } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface BlockDraft {
  id: number;
  startTime: string;
  endTime: string;
}

export function AvailabilityView({
  availability,
  currentExecId,
}: {
  availability: AvailabilityRow[];
  currentExecId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [days, setDays] = useState<Date[]>([]);
  const [blocks, setBlocks] = useState<BlockDraft[]>([{ id: 1, startTime: "", endTime: "" }]);
  const [nextBlockId, setNextBlockId] = useState(2);
  const [today] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const router = useRouter();

  function updateBlock(id: number, patch: Partial<BlockDraft>) {
    setBlocks((current) => current.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function addBlock() {
    setBlocks((current) => [...current, { id: nextBlockId, startTime: "", endTime: "" }]);
    setNextBlockId((n) => n + 1);
  }

  function removeBlock(id: number) {
    setBlocks((current) => (current.length === 1 ? current : current.filter((b) => b.id !== id)));
  }

  function handleAdd() {
    startTransition(async () => {
      const result = await addAvailabilityEntryAction(
        days.map(toDateString),
        blocks.map(({ startTime, endTime }) => ({ startTime, endTime })),
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added ${result.addedCount ?? 0} availability block(s).`);
      setDays([]);
      setBlocks([{ id: nextBlockId, startTime: "", endTime: "" }]);
      setNextBlockId((n) => n + 1);
      router.refresh();
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeAvailabilityBlockAction(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  const mine = availability.filter((a) => a.execId === currentExecId);

  return (
    <div className="mt-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add the times you&apos;re free</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-8 md:grid-cols-[auto_1fr]">
            <div>
              <p className="text-sm font-medium">1. Click every day you&apos;re free</p>
              <Calendar
                mode="multiple"
                selected={days}
                onSelect={(selected) => setDays(selected ?? [])}
                disabled={{ before: today }}
                showOutsideDays={false}
                className="mt-2 rounded-2xl border border-border [--cell-size:--spacing(10)]"
              />
              {days.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {days.length} day{days.length === 1 ? "" : "s"} selected
                </p>
              )}
            </div>

            <div>
              <p className="text-sm font-medium">2. Set your time blocks (applied to every selected day)</p>
              <div className="mt-2 space-y-2">
                {blocks.map((block) => (
                  <div key={block.id} className="flex flex-wrap items-center gap-2">
                    <Input
                      type="time"
                      aria-label="Start time"
                      className="w-36"
                      value={block.startTime}
                      onChange={(e) => updateBlock(block.id, { startTime: e.target.value })}
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input
                      type="time"
                      aria-label="End time"
                      className="w-36"
                      value={block.endTime}
                      onChange={(e) => updateBlock(block.id, { endTime: e.target.value })}
                    />
                    {blocks.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove time block"
                        onClick={() => removeBlock(block.id)}
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={addBlock}>
                <Plus className="size-4" />
                Add another time block
              </Button>

              <div className="mt-6">
                <Button onClick={handleAdd} disabled={isPending}>
                  Add availability
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your availability</CardTitle>
        </CardHeader>
        <CardContent>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven&apos;t added any availability yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{formatDateLong(a.date)}</TableCell>
                    <TableCell>
                      {formatTime12h(a.startTime)} to {formatTime12h(a.endTime)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove availability"
                        onClick={() => handleRemove(a.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
