"use client";

import { useState } from "react";
import type { ScoringBundle } from "@/lib/data/recruit-scoring";
import { Segmented } from "./segmented";
import { ReviewProgressView } from "./review-progress-view";
import { ScoringView } from "./scoring-view";

type View = "queue" | "progress";

/** One tab for everything about reviewing: your own queue, and how the whole team is doing. */
export function ReviewsView({ quarterId, scoring }: { quarterId: string; scoring: ScoringBundle }) {
  const [view, setView] = useState<View>("queue");
  const mine = scoring.stages.resume.applicants;
  const scored = mine.filter((a) => a.mine?.submitted).length;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Segmented
          label="Reviews view"
          value={view}
          onChange={setView}
          options={[
            { value: "queue", label: "My queue" },
            { value: "progress", label: "Progress" },
          ]}
        />
        {view === "queue" && mine.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <b className="text-foreground">{scored}</b> of {mine.length} scored by you
          </p>
        )}
      </div>
      {view === "queue" ? (
        <ScoringView stages={scoring.stages} settings={scoring.settings} />
      ) : (
        <ReviewProgressView quarterId={quarterId} dashboard={scoring.dashboard} setup={scoring.reviewSetup} />
      )}
    </div>
  );
}
