"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { deleteQuickLink } from "@/actions/quick-links";
import { QuickLinkDialog } from "./quick-link-dialog";
import type { QuickLink } from "@/lib/data/quick-links";

const UNCATEGORIZED = "Other";

export function QuickLinksView({ links, canEdit }: { links: QuickLink[]; canEdit: boolean }) {
  const groups = new Map<string, QuickLink[]>();
  for (const link of links) {
    const key = link.category?.trim() || UNCATEGORIZED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(link);
  }
  const groupNames = [...groups.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <QuickLinkDialog />
        </div>
      )}

      {links.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          {canEdit ? "No links yet. Add the first one to get started." : "No links here yet."}
        </p>
      ) : (
        <div className="space-y-5">
          {groupNames.map((name) => (
            <div key={name} className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {name}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {groups.get(name)!.map((link) => (
                  <QuickLinkRow key={link.id} link={link} canEdit={canEdit} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickLinkRow({ link, canEdit }: { link: QuickLink; canEdit: boolean }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  function onDelete() {
    setIsDeleting(true);
    deleteQuickLink(link.id).then((result) => {
      setIsDeleting(false);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-start justify-between gap-2 rounded-md border p-3">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-w-0 flex-1 items-start gap-2"
      >
        <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium group-hover:underline">
            {link.title}
          </span>
          {link.description && (
            <span className="block truncate text-xs text-muted-foreground">{link.description}</span>
          )}
        </div>
      </a>

      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <QuickLinkDialog
            link={link}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${link.title}`}>
                <Pencil className="size-3.5" />
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${link.title}`}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}

      {canEdit && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &quot;{link.title}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} disabled={isDeleting}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
