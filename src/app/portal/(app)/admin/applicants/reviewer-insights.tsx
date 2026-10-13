import type { ReviewerInsightRow } from "@/lib/data/recruit-scoring";
import { Badge } from "@/components/ui/badge";

export function ReviewerInsights({ reviewers, minN }: { reviewers: ReviewerInsightRow[]; minN: number }) {
  if (reviewers.length === 0) {
    return <p className="text-sm text-muted-foreground">No submitted scores yet. Reviewer stats show up once people start scoring.</p>;
  }
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {reviewers.map((r) => (
          <li key={r.reviewerId} className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
            <span className="font-medium">{r.name}</span>
            <span className="text-xs text-muted-foreground">
              {r.n} scored{r.mean !== null && r.sd !== null ? ` · average ${r.mean.toFixed(2)} · spread ${r.sd.toFixed(2)}` : " · average shown after more scores"}
            </span>
            {r.normalized ? (
              <Badge variant="secondary">evened out</Badge>
            ) : (
              <Badge variant="outline">{r.sd === 0 ? "always the same score" : `needs ${Math.max(0, minN - r.n)} more`}</Badge>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        &ldquo;Average&rdquo; shows who grades harsh or generous. Once someone has {minN} scores their ratings are adjusted so a
        tough grader&apos;s 3 and an easy grader&apos;s 4.5 can mean the same thing.
      </p>
    </div>
  );
}
