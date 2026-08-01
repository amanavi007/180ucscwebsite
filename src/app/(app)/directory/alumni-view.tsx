"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/lib/auth/roles";
import type { AlumniProfile } from "@/lib/data/alumni";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AlumniView({ alumni }: { alumni: AlumniProfile[] }) {
  if (alumni.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No alumni yet -- graduated members show up here once they&apos;re archived.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {alumni.map((a) => (
        <div key={a.userId} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Avatar className="size-9">
                <AvatarFallback className="text-xs">{initials(a.name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium leading-tight">{a.name}</p>
                <p className="text-xs text-muted-foreground">Was {roleLabel(a.role)}</p>
              </div>
            </div>
            {a.linkedinUrl && (
              <a
                href={a.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${a.name}'s LinkedIn`}
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-4" />
              </a>
            )}
          </div>

          {(a.currentTitle || a.currentCompany) && (
            <p className="text-sm">
              {a.currentTitle}
              {a.currentTitle && a.currentCompany ? " at " : ""}
              {a.currentCompany}
            </p>
          )}

          {a.projects.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {a.projects.map((p) => (
                <Link key={p.projectId} href={`/projects/${p.projectId}`}>
                  <Badge variant="outline" className="font-normal text-muted-foreground hover:text-foreground">
                    {p.clientName}
                    {p.quarterName ? ` · ${p.quarterName}` : ""}
                  </Badge>
                </Link>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Graduated {new Date(a.archivedAt).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}
