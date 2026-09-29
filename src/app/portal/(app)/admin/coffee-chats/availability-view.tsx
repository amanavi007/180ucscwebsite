"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { addAvailabilityBlockAction, removeAvailabilityBlockAction } from "@/actions/coffee-chat";
import type { AvailabilityRow } from "@/lib/data/coffee-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AvailabilityView({
  availability,
  currentExecId,
}: {
  availability: AvailabilityRow[];
  currentExecId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const router = useRouter();

  function handleAdd() {
    if (!date || !startTime || !endTime) {
      toast.error("Fill in a date and both times.");
      return;
    }
    startTransition(async () => {
      const result = await addAvailabilityBlockAction(date, startTime, endTime);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Availability added.");
      setDate("");
      setStartTime("");
      setEndTime("");
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
          <CardTitle className="text-base">Add a block of time you&apos;re free</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="flex flex-wrap items-end gap-3">
            <Field className="w-40">
              <FieldLabel htmlFor="cc-date">Date</FieldLabel>
              <Input id="cc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field className="w-32">
              <FieldLabel htmlFor="cc-start">Start</FieldLabel>
              <Input id="cc-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field className="w-32">
              <FieldLabel htmlFor="cc-end">End</FieldLabel>
              <Input id="cc-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
            <Button onClick={handleAdd} disabled={isPending}>
              Add
            </Button>
          </FieldGroup>
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
                    <TableCell>{a.date}</TableCell>
                    <TableCell>
                      {a.startTime}–{a.endTime}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleRemove(a.id)} disabled={isPending}>
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
