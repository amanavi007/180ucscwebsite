"use client";

import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmOptions {
  /** One question, e.g. "Cancel Maya's coffee chat?" */
  title: string;
  /** What will happen, in one sentence. */
  description: string;
  /** Names the action, e.g. "Cancel the chat". Never "OK". */
  confirmLabel: string;
  cancelLabel?: string;
}

/**
 * Replaces window.confirm. `const [confirm, dialog] = useConfirm()`, render `{dialog}` once,
 * then `if (!(await confirm({...}))) return;`.
 */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    [],
  );

  function close(ok: boolean) {
    state?.resolve(ok);
    setState(null);
  }

  const dialog = (
    <AlertDialog open={!!state} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title}</AlertDialogTitle>
          <AlertDialogDescription>{state?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{state?.cancelLabel ?? "Keep it"}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => close(true)}>
            {state?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, dialog] as const;
}
