"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ListSearch } from "@/components/list-search";
import { useFilteredList } from "@/lib/use-filtered-list";
import type { ClientListRow } from "@/lib/data/clients";

export function ClientsTable({ clients }: { clients: ClientListRow[] }) {
  const { query, setQuery, filtered } = useFilteredList<ClientListRow>(clients, ["name"]);

  return (
    <div className="space-y-3">
      <ListSearch value={query} onChange={setQuery} placeholder="Search clients..." className="w-64" />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Projects</TableHead>
            <TableHead>Most recent</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No clients match your search.
              </TableCell>
            </TableRow>
          )}
          {filtered.map((c) => (
            <TableRow key={c.id} className={cn(c.isCurrent && "bg-primary/5")}>
              <TableCell>
                <Link href={`/portal/clients/${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {c.contactName || c.contactEmail ? (
                  <>
                    {c.contactName}
                    {c.contactName && c.contactEmail && " · "}
                    {c.contactEmail}
                  </>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-sm">{c.projectCount}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {c.isCurrent ? (
                  <Badge className="bg-primary/15 text-primary">Current</Badge>
                ) : (
                  (c.lastQuarterName ?? "—")
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
