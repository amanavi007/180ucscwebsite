import { Badge } from "@/components/ui/badge";
import type { BoardTeam } from "@/lib/data/team-builder";

type Check = { variant: "bad" | "warn" | "ok"; chip: string; text: string };

/** Advice on a draft before you finalize it. It never blocks anything: it just says what looks off. */
export function buildPlanChecks(board: { unassigned: unknown[]; teams: BoardTeam[] }): Check[] {
  const checks: Check[] = [];
  for (const team of board.teams) {
    const size = team.pm.length + team.sc.length + team.members.length;
    if (size === 0) {
      checks.push({ variant: "warn", chip: "Empty", text: `${team.clientName} has nobody on it yet.` });
      continue;
    }
    if (team.pm.length === 0) checks.push({ variant: "bad", chip: "No PM", text: `${team.clientName} has no project manager.` });
    if (team.sc.length === 0) checks.push({ variant: "warn", chip: "No SC", text: `${team.clientName} has no senior consultant.` });
  }
  const left = board.unassigned.length;
  if (left > 0) {
    checks.push({
      variant: "warn",
      chip: "Unassigned",
      text: `${left} ${left === 1 ? "person is" : "people are"} not on a team. Applying removes them from their real team.`,
    });
  }
  if (checks.length === 0 && board.teams.length > 0) {
    checks.push({ variant: "ok", chip: "Ready", text: "Every team has a PM and an SC, and everyone is placed." });
  }
  return checks;
}

export function PlanChecks({ board }: { board: { unassigned: unknown[]; teams: BoardTeam[] } }) {
  const checks = buildPlanChecks(board);
  return (
    <aside aria-labelledby="plan-checks-heading" className="hidden w-72 shrink-0 space-y-3 self-start rounded-[22px] border bg-card p-5 xl:block">
      <h2 id="plan-checks-heading" className="text-base">
        Before you finalize
      </h2>
      {checks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add a team to get started.</p>
      ) : (
        <ul className="space-y-3">
          {checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm leading-snug">
              <Badge variant={c.variant} className="mt-0.5 shrink-0">
                {c.chip}
              </Badge>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
