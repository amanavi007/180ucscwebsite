"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { markExecReviewDone } from "@/actions/tasks";
import { Button } from "@/components/ui/button";

export function MarkReviewedButton({ taskId, projectId }: { taskId: string; projectId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await markExecReviewDone(taskId, projectId);
          if (result?.error) toast.error(result.error);
          else {
            toast.success("Marked as reviewed. The consultant can now finish their fixes.");
            router.refresh();
          }
        })
      }
    >
      Mark reviewed
    </Button>
  );
}
