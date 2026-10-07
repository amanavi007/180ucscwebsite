"use client";

import { useState } from "react";
import type { ApplicantRow, MergeLogRow, RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import type { DuplicatePair } from "@/lib/recruit-matching";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicantsView } from "./applicants-view";
import { HowItWorks } from "./how-it-works";

export function ApplicantsWorkspace({
  quarterId,
  quarterName,
  rows,
  categories,
  events,
  pairs,
}: {
  quarterId: string;
  quarterName: string;
  rows: ApplicantRow[];
  categories: RecruitCategory[];
  events: RecruitEvent[];
  pairs: DuplicatePair[];
  merges: MergeLogRow[];
}) {
  const [tab, setTab] = useState("applicants");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        <HowItWorks />
      </div>

      <Tabs value={tab} onValueChange={(v) => v && setTab(String(v))}>
        <TabsList>
          <TabsTrigger value="applicants">Applicants</TabsTrigger>
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
            onReviewDuplicates={() => setTab("duplicates")}
            onSelect={setSelectedId}
            addButton={null}
          />
        </TabsContent>
        <TabsContent value="setup">
          <p className="mt-4 text-sm text-muted-foreground">Setup arrives in a later task.</p>
        </TabsContent>
        <TabsContent value="duplicates">
          <p className="mt-4 text-sm text-muted-foreground">Duplicates arrive in a later task.</p>
        </TabsContent>
      </Tabs>
      <span hidden>{selectedId}</span>
    </div>
  );
}
