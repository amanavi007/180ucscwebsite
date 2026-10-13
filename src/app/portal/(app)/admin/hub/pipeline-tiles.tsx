import Link from "next/link";
import { withQuarterParam } from "@/lib/admin-nav";

/** Big-number tiles for the quarter's recruiting so far. Each tile is a count with a plain label. */
export function PipelineTiles({
  quarterId,
  applicants,
  withoutApplication,
}: {
  quarterId: string | null;
  applicants: number;
  withoutApplication: number;
}) {
  const tiles = [
    { n: applicants, label: "Applicants", tone: "bg-sidebar-accent text-sidebar-primary" },
    { n: withoutApplication, label: "Added without an application", tone: "bg-status-warn text-status-warn-foreground" },
  ];
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
      <div className="mt-4 grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className={`rounded-[18px] p-4 ${t.tone}`}>
            <div className="font-heading text-4xl leading-none font-extrabold tracking-tight tabular-nums">{t.n}</div>
            <div className="mt-2 text-sm font-semibold">{t.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
