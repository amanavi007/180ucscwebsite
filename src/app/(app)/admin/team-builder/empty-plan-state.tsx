"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createPlan } from "@/actions/team-builder";
import { Button } from "@/components/ui/button";

export function EmptyPlanState({ quarterId }: { quarterId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onCreate() {
    startTransition(async () => {
      const result = await createPlan(quarterId, "Draft 1");
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.push(`/admin/team-builder?quarter=${quarterId}&plan=${result.id}`);
    });
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-8">
      <p className="text-sm text-muted-foreground">
        No drafts for this quarter yet -- start one to begin placing members onto teams.
      </p>
      <Button onClick={onCreate} disabled={isPending} className="gap-1.5">
        <Plus className="size-4" />
        New draft
      </Button>
    </div>
  );
}
