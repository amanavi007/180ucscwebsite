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
      </div>
      {view === "queue" ? (
        <ScoringView stages={scoring.stages} />
      ) : (
        <ReviewProgressView
          quarterId={quarterId}
          dashboard={scoring.dashboard}
          setup={scoring.reviewSetup}
          insights={scoring.stages.resume.reviewers}
          minN={scoring.settings.normalizeMinN}
        />
      )}
    </div>
  );
}
