"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link as LinkIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { MarkdownContent } from "@/components/markdown-content";
import { PageTree } from "./page-tree";
import { PageDialog } from "./page-dialog";
import { deleteWikiPage } from "@/actions/wiki";
import { format } from "date-fns";
import type { WikiSection } from "@/lib/supabase/database.types";
import type { WikiPageWithAuthor } from "@/lib/data/types";

export function ResourcesView({
  section,
  pages,
  canViewPm,
  canEdit,
  selectedSlug,
}: {
  section: WikiSection;
  pages: WikiPageWithAuthor[];
  canViewPm: boolean;
  canEdit: boolean;
  selectedSlug: string | null;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const topLevelSlug = pages.find((p) => p.parent_id === null)?.slug ?? null;
  const activeSlug = pages.some((p) => p.slug === selectedSlug) ? selectedSlug : topLevelSlug;
  const activePage = pages.find((p) => p.slug === activeSlug) ?? null;
  const childCount = activePage ? pages.filter((p) => p.parent_id === activePage.id).length : 0;

  // Keep the URL pointing at the page actually shown (e.g. after auto-selecting
  // the first top-level page) so the address bar is always a shareable link.
  useEffect(() => {
    if (activeSlug && activeSlug !== selectedSlug) {
      router.replace(`/resources?section=${section}&page=${activeSlug}`);
    }
  }, [activeSlug, selectedSlug, section, router]);

  function selectPage(slug: string) {
    router.push(`/resources?section=${section}&page=${slug}`);
  }

  function copyLink() {
    if (!activePage) return;
    const url = `${window.location.origin}/resources?section=${section}&page=${activePage.slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied.");
  }

  function onDelete() {
    if (!activePage) return;
    setIsDeleting(true);
    deleteWikiPage(activePage.id).then((result) => {
      setIsDeleting(false);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setDeleteOpen(false);
      router.push(`/resources?section=${section}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={section}
          onValueChange={(v) => v && router.push(`/resources?section=${v}`)}
        >
          <TabsList>
            <TabsTrigger value="consultant">Consultant Resources</TabsTrigger>
            {canViewPm && <TabsTrigger value="pm">PM Resources</TabsTrigger>}
          </TabsList>
        </Tabs>

        {canEdit && <PageDialog section={section} pages={pages} />}
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <aside className="rounded-md border p-2 md:h-fit">
          <PageTree pages={pages} selectedSlug={activeSlug} onSelect={selectPage} />
        </aside>

        <div className="min-w-0 rounded-md border p-6">
          {!activePage ? (
            <p className="text-sm text-muted-foreground">
              {canEdit
                ? "No pages yet. Create the first one to get started."
                : "No pages here yet."}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{activePage.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    Last updated {format(new Date(activePage.updated_at), "MMM d, yyyy")}
                    {activePage.updated_by_profile && ` by ${activePage.updated_by_profile.name}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy link to this page"
                    onClick={copyLink}
                  >
                    <LinkIcon className="size-3.5" />
                  </Button>
                  {canEdit && (
                    <>
                      <PageDialog
                        section={section}
                        pages={pages}
                        page={activePage}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="Edit page">
                            <Pencil className="size-3.5" />
                          </Button>
                        }
                      />
                      <PageDialog
                        section={section}
                        pages={pages}
                        defaultParentId={activePage.id}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="Add sub-page">
                            <Plus className="size-3.5" />
                          </Button>
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete page"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {activePage.body ? (
                <MarkdownContent body={activePage.body} />
              ) : (
                <p className="text-sm text-muted-foreground">This page is empty.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {activePage && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &quot;{activePage.title}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>
                This can&apos;t be undone.
                {childCount > 0 &&
                  ` This will also delete ${childCount} sub-page${childCount === 1 ? "" : "s"}.`}
              </AlertDialogDescription>
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
