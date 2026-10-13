"use client";

import { useState } from "react";
import { ChevronDown, FileSpreadsheet, FileUp, UserPlus } from "lucide-react";
import type { ApplicantRow, MergeLogRow, RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import type { AttendanceData } from "@/lib/data/recruit-import";
import type { ScoringBundle } from "@/lib/data/recruit-scoring";
import type { DuplicatePair } from "@/lib/recruit-matching";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddApplicantDialog } from "./add-applicant-dialog";
import { ApplicantPanel } from "./applicant-panel";
import { ApplicantsView } from "./applicants-view";
import { AttendanceView } from "./attendance-view";
import { DuplicatesView } from "./duplicates-view";
import { GivePointsDialog } from "./give-points-dialog";
import { HowItWorks } from "./how-it-works";
import { ImportApplicationsDialog } from "./import-applications-dialog";
import { ImportDialog } from "./import-dialog";
import { ReviewsView } from "./reviews-view";
import { SetupView } from "./setup-view";

export function ApplicantsWorkspace({
  quarterId,
  quarterName,
  rows,
  categories,
  events,
  pairs,
  merges,
  attendance,
  scoring,
}: {
  quarterId: string;
  quarterName: string;
  rows: ApplicantRow[];
  categories: RecruitCategory[];
  events: RecruitEvent[];
  pairs: DuplicatePair[];
  merges: MergeLogRow[];
  attendance: AttendanceData;
  scoring: ScoringBundle;
}) {
  const [tab, setTab] = useState("applicants");
  const [addOpen, setAddOpen] = useState(false);
  const [importApplicationsOpen, setImportApplicationsOpen] = useState(false);
  const [importAttendanceOpen, setImportAttendanceOpen] = useState(false);
  const applicantNames = Object.fromEntries(rows.map((r) => [r.id, r.name]));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [givingId, setGivingId] = useState<string | null>(null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const giving = rows.find((r) => r.id === givingId) ?? null;

  const reviewStatus = Object.fromEntries(scoring.dashboard.applicants.map((a) => [a.id, a.state]));

  const withoutApplication = rows.filter((r) => !r.hasApplication).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">Applicants</h1>
          <p className="mt-1.5 flex items-center gap-1 text-sm text-muted-foreground">
            {quarterName} · {rows.length - withoutApplication} applicant{rows.length - withoutApplication === 1 ? "" : "s"}
            {withoutApplication > 0 && ` · ${withoutApplication} without an application`}
            <HowItWorks />
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="lg">
                Add applicants
                <ChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={() => setAddOpen(true)}>
              <UserPlus />
              Add one person
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setImportApplicationsOpen(true)}>
              <FileSpreadsheet />
              Import applications
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setImportAttendanceOpen(true)}>
              <FileUp />
              Import an attendance list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs value={tab} onValueChange={(v) => v && setTab(String(v))}>
        <TabsList variant="line" className="h-auto w-full justify-start gap-8 border-b p-0">
          {[
            { value: "applicants", label: "Applicants", count: 0 },
            { value: "reviews", label: "Reviews", count: scoring.dashboard.totals.unassigned },
            { value: "attendance", label: "Attendance", count: attendance.toMark.length },
            { value: "settings", label: "Settings", count: 0 },
          ].map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="h-auto flex-none gap-2 px-0 py-3 text-sm data-active:font-semibold after:bottom-[-1px] after:bg-primary"
            >
              {t.label}
              {t.count > 0 && <Badge className="h-5 min-w-5 rounded-full px-1.5 text-xs">{t.count}</Badge>}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="applicants">
          <ApplicantsView
            quarterId={quarterId}
            rows={rows}
            categories={categories}
            events={events}
            duplicateCount={pairs.length}
            toMarkCount={attendance.toMark.length}
            onReviewDuplicates={() => setTab("duplicates")}
            onReviewAttendance={() => setTab("attendance")}
            onSelect={setSelectedId}
            reviewStatus={reviewStatus}
            onAdd={() => setAddOpen(true)}
          />
        </TabsContent>
        <TabsContent value="reviews">
          <ReviewsView quarterId={quarterId} scoring={scoring} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceView quarterId={quarterId} data={attendance} applicantNames={applicantNames} />
        </TabsContent>
        <TabsContent value="settings">
          <SetupView
            quarterId={quarterId}
            categories={categories}
            events={events}
            rubrics={{ resume: scoring.stages.resume.rubric, interview: scoring.stages.interview.rubric }}
            settings={scoring.settings}
            reviewSetup={scoring.reviewSetup}
          />
        </TabsContent>
        {/* Reached from the "possible duplicates" link on the Applicants tab, so it has no tab of its own. */}
        <TabsContent value="duplicates">
          <div className="mt-6 space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setTab("applicants")}>
              ← Back to applicants
            </Button>
            <DuplicatesView rows={rows} pairs={pairs} merges={merges} />
          </div>
        </TabsContent>
      </Tabs>

      <AddApplicantDialog quarterId={quarterId} open={addOpen} onOpenChange={setAddOpen} />
      <ImportApplicationsDialog quarterId={quarterId} open={importApplicationsOpen} onOpenChange={setImportApplicationsOpen} />
      <ImportDialog
        quarterId={quarterId}
        categories={categories}
        events={events}
        open={importAttendanceOpen}
        onOpenChange={setImportAttendanceOpen}
      />
      <ApplicantPanel
        applicant={selected}
        onClose={() => setSelectedId(null)}
        onGivePoints={() => setGivingId(selectedId)}
        summaries={
          selected
            ? { resume: scoring.summaries.resume[selected.id], interview: scoring.summaries.interview[selected.id] }
            : {}
        }
        disagreementThreshold={scoring.settings.disagreementThreshold}
      />
      <GivePointsDialog
        applicant={giving}
        categories={categories}
        events={events}
        onOpenChange={(open) => !open && setGivingId(null)}
      />
    </div>
  );
}
