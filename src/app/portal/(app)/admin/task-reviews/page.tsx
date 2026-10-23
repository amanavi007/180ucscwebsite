import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { getCurrentProfile } from "@/lib/data/profile";
import { getExecReviewLoad, getMyTaskReviews, type MyTaskReview } from "@/lib/data/task-reviews";
import { getApprovedPhotoUrls } from "@/lib/data/team-page";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkReviewedButton } from "./mark-reviewed-button";
import { ReviewLoad } from "./review-load";

export const metadata: Metadata = { title: "Admin · Task Reviews" };

function ReviewRow({ review }: { review: MyTaskReview }) {
  const done = !!review.reviewedAt;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-4">
      <Badge variant={done ? "ok" : "warn"} className="shrink-0">
        {done ? "Reviewed" : "Waiting on you"}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="break-words text-[0.9375rem] font-semibold">
          {review.consultantName} · {review.taskName}
        </p>
        <p className="break-words text-sm text-muted-foreground">
          {review.clientName} · assigned {format(new Date(review.assignedAt), "MMM d")}
          {review.others.length > 0 &&
            ` · ${review.others.map((o) => `${o.name} ${o.done ? "has reviewed" : "hasn't reviewed yet"}`).join(", ")}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          render={<Link href={`/portal/projects/${review.projectId}`}>Open project</Link>}
        />
        {!done && <MarkReviewedButton taskId={review.taskId} projectId={review.projectId} />}
      </div>
    </li>
  );
}

export default async function TaskReviewsPage() {
  const profile = await getCurrentProfile();
  const isSuperAdmin = profile.role === "director_of_projects";
  const [reviews, load, photos] = await Promise.all([
    getMyTaskReviews(profile.id),
    // The load overview is a nice-to-have: a failure must not hide the reviews this exec owes.
    isSuperAdmin ? getExecReviewLoad().catch((error) => (console.error("Review load failed:", error), null)) : null,
    isSuperAdmin ? getApprovedPhotoUrls() : {},
  ]);
  const owed = reviews.filter((r) => !r.reviewedAt);
  const done = reviews.filter((r) => r.reviewedAt);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Task reviews"
        description="Preliminary research and deliverables that were assigned to you for exec review. Read the work, leave your comments, then mark it reviewed so the consultant can finish their fixes."
      />

      <section aria-labelledby="owed-heading" className="rounded-[22px] border bg-card">
        <h2 id="owed-heading" className="px-5 pt-5 pb-3 text-lg">
          Waiting on you{owed.length > 0 ? ` · ${owed.length}` : ""}
        </h2>
        {owed.length === 0 ? (
          <div className="flex items-center gap-2.5 border-t px-5 py-5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-5 text-link" aria-hidden />
            No reviews waiting. You&apos;re assigned one automatically when a consultant finishes their PM/SC revisions.
          </div>
        ) : (
          <ul>
            {owed.map((r) => (
              <ReviewRow key={r.taskId} review={r} />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section aria-labelledby="done-heading" className="rounded-[22px] border bg-card">
          <h2 id="done-heading" className="px-5 pt-5 pb-3 text-lg">
            You&apos;ve reviewed · {done.length}
          </h2>
          <ul>
            {done.map((r) => (
              <ReviewRow key={r.taskId} review={r} />
            ))}
          </ul>
        </section>
      )}

      {load && <ReviewLoad rows={load} photos={photos} />}
    </div>
  );
}
