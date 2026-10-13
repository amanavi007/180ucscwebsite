"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkCreateMembers, type BulkCreateResult } from "@/actions/members";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MaskedSecret } from "./masked-secret";

function parseRows(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, email] = line.split(",").map((s) => s.trim());
      return { name: name ?? "", email: email ?? "" };
    });
}

export function BulkAddDialog({
  defaultPassword,
  defaultOpen = false,
}: {
  defaultPassword: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [bulkText, setBulkText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<BulkCreateResult[] | null>(null);

  const previewRows = parseRows(bulkText);

  function onCreate() {
    const rows = parseRows(bulkText);
    if (rows.length === 0) {
      toast.error("Paste at least one row: Name, email@180dc.org");
      return;
    }
    startTransition(async () => {
      const res = await bulkCreateMembers(rows);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const rowResults = res.results ?? [];
      setResults(rowResults);
      const created = rowResults.filter((r) => r.status === "created").length;
      const failed = rowResults.length - created;
      if (created > 0) {
        toast.success(`${created} account${created === 1 ? "" : "s"} created.`);
        setBulkText("");
      }
      if (failed > 0) toast.error(`${failed} row${failed === 1 ? "" : "s"} failed. See details below.`);
    });
  }

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        Add members
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add members</DialogTitle>
            <DialogDescription>
              One per line: <code>Name, email@180dc.org</code>. New accounts get the default
              password <MaskedSecret value={defaultPassword} /> and a consultant role, and are
              forced to set their own password on first login. Change the default password in
              Settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              rows={5}
              placeholder={"Jane Doe, jane@180dc.org\nJohn Smith, john@180dc.org"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {previewRows.length} row{previewRows.length === 1 ? "" : "s"} ready.
              </p>
              <Button onClick={onCreate} disabled={isPending || previewRows.length === 0}>
                Create accounts
              </Button>
            </div>

            {results && results.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r, i) => (
                      <TableRow key={`${r.email}-${i}`}>
                        <TableCell>{r.name || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.email || "-"}</TableCell>
                        <TableCell>
                          {r.status === "created" ? (
                            <Badge className="border-transparent bg-accent text-accent-foreground">
                              Created
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-transparent bg-status-bad text-status-bad-foreground"
                            >
                              {r.message ?? "Failed"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
