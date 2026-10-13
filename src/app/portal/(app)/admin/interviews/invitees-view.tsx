"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { addInviteesAction, removeInviteeAction } from "@/actions/interview";
import type { InviteeRow } from "@/lib/data/interview";
import { formatTime12h } from "@/lib/coffee-chat";
import { formatDateLong } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function InviteesView({ invitees, openSlotCount }: { invitees: InviteeRow[]; openSlotCount: number }) {
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const router = useRouter();

  const bookedCount = invitees.filter((i) => i.booking).length;
  const waitingCount = invitees.length - bookedCount;

  function handleAdd() {
    startTransition(async () => {
      const result = await addInviteesAction(text);
      setProblems(result.errors ?? []);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added ${result.addedCount ?? 0} invitee(s).`);
      if ((result.errors ?? []).length === 0) setText("");
      router.refresh();
    });
  }

  function handleRemove(invitee: InviteeRow) {
    startTransition(async () => {
      const result = await removeInviteeAction(invitee.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.hadActiveBooking) {
        toast.warning(`${invitee.email} was removed, but their existing booking was kept. Cancel it from the Schedule tab if needed.`);
      } else {
        toast.success("Removed.");
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-4 grid items-start gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add invitees</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            One per line: <span className="font-mono">email</span> or <span className="font-mono">email, name</span>. Only these
            UCSC emails can book an interview.
          </p>
          <textarea
            aria-label="Invitee list"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={"jane.doe@ucsc.edu, Jane Doe\nsam@ucsc.edu"}
            className="mt-3 w-full rounded-lg border border-input bg-background p-3 font-mono text-sm"
          />
          {problems.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-status-bad-foreground">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <Button className="mt-3" onClick={handleAdd} disabled={isPending || text.trim() === ""}>
            Add to invite list
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Invitees ({invitees.length}) · {bookedCount} booked · {waitingCount} not yet booked
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {openSlotCount} open published slot(s) for {waitingCount} unbooked invitee(s).
            {openSlotCount < waitingCount && " You may need more availability."}
          </p>
        </CardHeader>
        <CardContent>
          {invitees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invitees yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitees.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell>{i.name ?? ""}</TableCell>
                    <TableCell>
                      {i.booking ? (
                        <Badge>
                          {formatDateLong(i.booking.date)} · {formatTime12h(i.booking.startTime)}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Not booked</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${i.email}`}
                        onClick={() => handleRemove(i)}
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
