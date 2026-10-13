"use client";

import { useState } from "react";
import type { ApplicantRow, MergeLogRow, RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import type { AttendanceData } from "@/lib/data/recruit-import";
import type { ScoringBundle } from "@/lib/data/recruit-scoring";
import type { DuplicatePair } from "@/lib/recruit-matching";
import { Badge } from "@/components/ui/badge";
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
import { ReviewProgressView } from "./review-progress-view";
import { ScoringView } from "./scoring-view";
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
  const applicantNames = Object.fromEntries(rows.map((r) => [r.id, r.name]));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [givingId, setGivingId] = useState<string | null>(null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const giving = rows.find((r) => r.id === givingId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Applicants</h1>
          <p className="text-sm text-muted-foreground">
            {quarterName} · {rows.length} applicant{rows.length === 1 ? "" : "s"}. Track points from info sessions, coffee
            chats and more, then compare everyone in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HowItWorks />
          <ImportApplicationsDialog quarterId={quarterId} />
          <ImportDialog quarterId={quarterId} categories={categories} events={events} />
          <AddApplicantDialog quarterId={quarterId} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => v && setTab(String(v))}>
        <TabsList>
          <TabsTrigger value="applicants">Applicants</TabsTrigger>
          <TabsTrigger value="attendance">
            Attendance
            {attendance.toMark.length > 0 && <Badge variant="secondary">{attendance.toMark.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="review">
            Review progress
            {scoring.dashboard.totals.unassigned > 0 && <Badge variant="secondary">{scoring.dashboard.totals.unassigned}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="duplicates">
            Duplicates
            {pairs.length > 0 && <Badge variant="secondary">{pairs.length}</Badge>}
          </TabsTrigger>
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
            addButton={<AddApplicantDialog quarterId={quarterId} />}
          />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceView quarterId={quarterId} data={attendance} applicantNames={applicantNames} />
        </TabsContent>
        <TabsContent value="scoring">
          <ScoringView stages={scoring.stages} settings={scoring.settings} />
        </TabsContent>
        <TabsContent value="review">
          <ReviewProgressView quarterId={quarterId} dashboard={scoring.dashboard} setup={scoring.reviewSetup} />
        </TabsContent>
        <TabsContent value="setup">
          <SetupView quarterId={quarterId} categories={categories} events={events} rubrics={{ resume: scoring.stages.resume.rubric, interview: scoring.stages.interview.rubric }} settings={scoring.settings} reviewSetup={scoring.reviewSetup} />
        </TabsContent>
        <TabsContent value="duplicates">
          <DuplicatesView rows={rows} pairs={pairs} merges={merges} />
        </TabsContent>
      </Tabs>
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
