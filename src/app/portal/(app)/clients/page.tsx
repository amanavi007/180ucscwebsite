import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/data/profile";
import { getClients } from "@/lib/data/clients";
import { isExec } from "@/lib/auth/roles";
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
import { NewClientDialog } from "./new-client-dialog";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const profile = await getCurrentProfile();
  const clients = await getClients();
  const exec = isExec(profile.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Contact info and project history across quarters -- who we&apos;ve worked with before.
          </p>
        </div>
        {exec && <NewClientDialog />}
      </div>

      {clients.length === 0 ? (
        <p className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          No clients recorded yet. Link a project to a client to start building history.
        </p>
      ) : (
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
            {clients.map((c) => (
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
      )}
    </div>
  );
}
