"use client";

import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QuickEntryForm } from "./quick-entry-form";
import { HistoryList } from "./history-list";
import type { ProjectWithRelations, MembershipWithProfile } from "@/lib/data/types";
import type { AttendanceHistoryRow, SessionWithMarks } from "@/lib/data/attendance";

export function AttendanceView({
  projects,
  selectedProjectId,
  canSubmit,
  roster,
  history,
  today,
  initialSession,
}: {
  projects: ProjectWithRelations[];
  selectedProjectId: string | null;
  canSubmit: boolean;
  roster: MembershipWithProfile[];
  history: AttendanceHistoryRow[];
  today: string;
  initialSession: SessionWithMarks | null;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      {selectedProjectId && (
        <Tabs defaultValue={canSubmit ? "entry" : "history"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {projects.length > 1 ? (
              <Select
                value={selectedProjectId ?? undefined}
                onValueChange={(v) => v && router.push(`/portal/attendance?team=${v}`)}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select a team">
                    {(value: string) => projects.find((p) => p.id === value)?.client_name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.client_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span />
            )}
            <TabsList>
              {canSubmit && <TabsTrigger value="entry">Quick entry</TabsTrigger>}
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>
          {canSubmit && (
            <TabsContent value="entry">
              <QuickEntryForm
                projectId={selectedProjectId}
                roster={roster}
                today={today}
                initialSession={initialSession}
              />
            </TabsContent>
          )}
          <TabsContent value="history">
            <HistoryList history={history} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
