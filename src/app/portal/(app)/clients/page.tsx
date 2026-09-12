import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/profile";
import { getClients } from "@/lib/data/clients";
import { isExec } from "@/lib/auth/roles";
import { NewClientDialog } from "./new-client-dialog";
import { ClientsTable } from "./clients-table";

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
        <ClientsTable clients={clients} />
      )}
    </div>
  );
}
