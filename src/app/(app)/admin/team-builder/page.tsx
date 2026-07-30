import type { Metadata } from "next";
import { getQuarters } from "@/lib/data/quarters";
import { getPlanBoard, getPlansForQuarter } from "@/lib/data/team-builder";
import { TeamBuilderBoard } from "./team-builder-board";
import { QuarterSelect } from "./quarter-select";
import { PlanSelect } from "./plan-select";
import { EmptyPlanState } from "./empty-plan-state";

export const metadata: Metadata = { title: "Admin · Team Builder" };

export default async function TeamBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string; plan?: string }>;
}) {
  const { quarter, plan } = await searchParams;
  const quarters = await getQuarters();

  if (quarters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No quarters yet -- create one in the Quarters tab first.
      </p>
    );
  }

  const selectedQuarter =
    quarters.find((q) => q.id === quarter) ?? quarters.find((q) => q.is_active) ?? quarters[0];

  const plans = await getPlansForQuarter(selectedQuarter.id);
  const selectedPlan = plans.find((p) => p.id === plan) ?? plans[0] ?? null;

  const board = selectedPlan ? await getPlanBoard(selectedPlan.id, selectedQuarter.id) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Sketch out roster drafts, then Finalize the one you want to apply.
        </p>
        <div className="flex items-center gap-2">
          <QuarterSelect quarters={quarters} selectedId={selectedQuarter.id} />
          {plans.length > 0 && (
            <PlanSelect quarterId={selectedQuarter.id} plans={plans} selectedPlan={selectedPlan} />
          )}
        </div>
      </div>

      {board && selectedPlan ? (
        <TeamBuilderBoard
          key={selectedPlan.id}
          quarterId={selectedQuarter.id}
          plan={selectedPlan}
          board={board}
        />
      ) : (
        <EmptyPlanState quarterId={selectedQuarter.id} />
      )}
    </div>
  );
}
