import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { getQuarters } from "@/lib/data/quarters";
import { getPlanBoard, getPlansForQuarter } from "@/lib/data/team-builder";
import { TeamBuilderBoard } from "./team-builder-board";
import { QuarterSelect } from "./quarter-select";
import { PlanSelect } from "./plan-select";
import { EmptyPlanState } from "./empty-plan-state";

export const metadata: Metadata = { title: "Team Builder" };

export default async function TeamBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string; plan?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    redirect("/");
  }

  const { quarter, plan } = await searchParams;
  const quarters = await getQuarters();

  if (quarters.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Team Builder</h1>
        <p className="text-sm text-muted-foreground">
          No quarters yet -- create one in Admin &gt; Quarters first.
        </p>
      </div>
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
        <div>
          <Link
            href="/admin"
            className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <ChevronLeft className="size-3.5" />
            Admin
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Team Builder</h1>
          <p className="text-sm text-muted-foreground">
            Sketch out roster drafts, then Finalize the one you want to apply.
          </p>
        </div>
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
