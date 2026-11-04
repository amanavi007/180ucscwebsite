"use client";

import { useRouter } from "next/navigation";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/url-tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitAttendance, fetchSessionForDate } from "@/actions/attendance";
import { submitJcAttendance, fetchJcSessionForDate } from "@/actions/jc-onboarding";
import { JC_GROUP_ID } from "@/lib/onboarding-attendance";
import { QuickEntryForm, type EntrySession } from "./quick-entry-form";
import { HistoryList } from "./history-list";
import type { ProjectWithRelations, MembershipWithProfile } from "@/lib/data/types";
import type { AttendanceHistoryRow, SessionWithMarks } from "@/lib/data/attendance";

export interface JcGroup {
  roster: { id: string; name: string }[];
  history: AttendanceHistoryRow[];
  meetingDates: string[];
  initialSession: EntrySession | null;
}

export function AttendanceView({
  projects,
  selectedProjectId,
  canSubmit,
  roster,
  history,
  meetingDates,
  today,
  initialSession,
  jc,
}: {
  projects: ProjectWithRelations[];
  selectedProjectId: string | null;
  canSubmit: boolean;
  roster: MembershipWithProfile[];
  history: AttendanceHistoryRow[];
  meetingDates: string[];
  today: string;
  initialSession: SessionWithMarks | null;
  /** Present for execs: JC onboarding shows up in the team toggle. */
  jc: JcGroup | null;
}) {
  const router = useRouter();
  const isJc = selectedProjectId === JC_GROUP_ID && !!jc;
  const showSelect = projects.length > 1 || (!!jc && projects.length > 0) || isJc;
  const teamSession: EntrySession | null = initialSession
    ? { marks: initialSession.marks.map((m) => ({ id: m.user_id, mark: m.mark })) }
    : null;

  return (
    <div className="space-y-4">
      {selectedProjectId && (
        <UrlTabs values={canSubmit ? ["entry", "history"] : ["history"]} fallback={canSubmit ? "entry" : "history"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {showSelect ? (
              <Select
                value={selectedProjectId ?? undefined}
                onValueChange={(v) => v && router.push(`/portal/attendance?team=${v}`)}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select a team">
                    {(value: string) =>
                      value === JC_GROUP_ID ? "JC Onboarding" : projects.find((p) => p.id === value)?.client_name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.client_name}
                    </SelectItem>
                  ))}
                  {jc && <SelectItem value={JC_GROUP_ID}>JC Onboarding</SelectItem>}
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
              {isJc && jc ? (
                <QuickEntryForm
                  key={JC_GROUP_ID}
                  roster={jc.roster}
                  today={today}
                  initialSession={jc.initialSession}
                  loadSession={async (date) => (await fetchJcSessionForDate(date)) as EntrySession | null}
                  save={submitJcAttendance}
                  emptyText="No JCs yet. Add them in Admin > People > Onboarding."
                />
              ) : (
                <QuickEntryForm
                  key={selectedProjectId}
                  roster={roster.map((m) => ({ id: m.user_id, name: m.profile?.name ?? "Unknown" }))}
                  today={today}
                  initialSession={teamSession}
                  loadSession={async (date) => {
                    const session = await fetchSessionForDate(selectedProjectId, date);
                    return session ? { marks: session.marks.map((m) => ({ id: m.user_id, mark: m.mark })) } : null;
                  }}
                  save={(input) => submitAttendance({ projectId: selectedProjectId, ...input })}
                />
              )}
            </TabsContent>
          )}
          <TabsContent value="history">
            <HistoryList
              history={isJc && jc ? jc.history : history}
              meetingDates={isJc && jc ? jc.meetingDates : meetingDates}
              today={today}
            />
          </TabsContent>
        </UrlTabs>
      )}
    </div>
  );
}
