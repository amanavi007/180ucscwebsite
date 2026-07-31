import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/data/profile";
import { getClient } from "@/lib/data/clients";
import { getActiveQuarter } from "@/lib/data/quarters";
import { isExec } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/project-labels";
import { HealthBadge } from "@/components/health-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ProjectStatus, ProjectHealth } from "@/lib/supabase/database.types";
import type { ClientProject } from "@/lib/data/clients";
import { EditClientDialog } from "./edit-client-dialog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const client = await getClient(id);
  return { title: client ? client.name : "Client" };
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [profile, client, activeQuarter] = await Promise.all([
    getCurrentProfile(),
    getClient(id),
    getActiveQuarter(),
  ]);
  if (!client) notFound();

  const exec = isExec(profile.role);
  const currentProjects = client.projects.filter((p) => p.quarterId === activeQuarter?.id);
  const pastProjects = client.projects.filter((p) => p.quarterId !== activeQuarter?.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
          <p className="text-sm text-muted-foreground">
            {client.projects.length} project{client.projects.length === 1 ? "" : "s"} across quarters
          </p>
        </div>
        {exec && <EditClientDialog client={client} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {client.contactName || client.contactEmail ? (
            <div className="text-sm">
              {client.contactName && <p className="font-medium">{client.contactName}</p>}
              {client.contactEmail && (
                <a href={`mailto:${client.contactEmail}`} className="text-primary hover:underline">
                  {client.contactEmail}
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No contact info yet.</p>
          )}
          {client.notes && (
            <p className="border-t pt-3 text-sm whitespace-pre-wrap text-muted-foreground">
              {client.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {client.projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects linked to this client yet -- projects link automatically when their
              client name matches.
            </p>
          ) : (
            <>
              {currentProjects.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium tracking-wide text-primary uppercase">
                    Current quarter
                  </p>
                  <div className="overflow-hidden rounded-md border border-primary/30">
                    {currentProjects.map((p) => (
                      <ClientProjectRow key={p.id} project={p} current />
                    ))}
                  </div>
                </div>
              )}
              {pastProjects.length > 0 && (
                <div>
                  {currentProjects.length > 0 && (
                    <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Past quarters
                    </p>
                  )}
                  <div className="space-y-1">
                    {pastProjects.map((p) => (
                      <ClientProjectRow key={p.id} project={p} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClientProjectRow({ project: p, current }: { project: ClientProject; current?: boolean }) {
  return (
    <Link
      href={`/projects/${p.id}`}
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50",
        current && "bg-primary/5",
      )}
    >
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium">{p.clientName}</span>
        <span className="text-xs text-muted-foreground">{p.quarterName}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="secondary">{statusLabel(p.status as ProjectStatus)}</Badge>
        <HealthBadge health={p.health as ProjectHealth} />
      </div>
    </Link>
  );
}
