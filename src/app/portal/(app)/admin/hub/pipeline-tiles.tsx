import Link from "next/link";
import { withQuarterParam } from "@/lib/admin-nav";

/** Big-number tiles for how recruiting reviews are going. Each tile is a count with a plain label. */
export function PipelineTiles({
  quarterId,
  complete,
  inProgress,
  applicants,
  unassigned,
}: {
  quarterId: string | null;
  complete: number;
  inProgress: number;
  applicants: number;
  unassigned: number;
}) {
  const tiles = [
    { n: complete, label: "Fully reviewed", tone: "bg-sidebar text-sidebar-primary" },
    { n: inProgress, label: "In progress", tone: "bg-status-warn text-status-warn-foreground" },
    { n: applicants, label: "Applicants", tone: "bg-status-info text-status-info-foreground" },
    { n: unassigned, label: "No reviewer yet", tone: "bg-status-bad text-status-bad-foreground" },
  ];
  const pct = applicants > 0 ? Math.round((complete / applicants) * 100) : 0;
  return (
    <section aria-labelledby="pipeline-heading" className="rounded-[22px] border bg-card p-5">
      <div className="flex items-baseline justify-between">
        <h2 id="pipeline-heading" className="text-lg">
          Recruiting
        </h2>
        <Link
          href={withQuarterParam("/portal/admin/applicants", quarterId)}
          className="text-sm font-semibold text-link underline-offset-4 hover:underline"
        >
          Open recruiting
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={`rounded-[18px] p-4 ${t.tone}`}>
            <div className="font-heading text-4xl leading-none font-extrabold tracking-tight tabular-nums">{t.n}</div>
            <div className="mt-2 text-sm font-semibold">{t.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${pct}% of applicants fully reviewed`}>
        <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{complete} of {applicants} applicants have all their reviews in.</p>
    </section>
  );
}
