"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, ChevronRight, Link as LinkIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { MarkdownContent, headingId } from "@/components/markdown-content";
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
  const children = activePage ? pages.filter((p) => p.parent_id === activePage.id) : [];
  const parent = activePage?.parent_id ? pages.find((p) => p.id === activePage.parent_id) ?? null : null;
  const outline = (activePage?.body ?? "")
    .split("\n")
    .map((l) => /^(#{1,3})\s+(.+?)\s*#*$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ level: m[1].length, text: m[2].replace(/[*_`]/g, ""), id: headingId(m[2].replace(/[*_`]/g, "")) }));
  const childCount = children.length;

  // Keep the URL pointing at the page actually shown (e.g. after auto-selecting
  // the first top-level page) so the address bar is always a shareable link.
  useEffect(() => {
    if (activeSlug && activeSlug !== selectedSlug) {
      router.replace(`/portal/resources?section=${section}&page=${activeSlug}`);
    }
  }, [activeSlug, selectedSlug, section, router]);

  function selectPage(slug: string) {
    router.push(`/portal/resources?section=${section}&page=${slug}`);
  }

  function copyLink() {
    if (!activePage) return;
    const url = `${window.location.origin}/portal/resources?section=${section}&page=${activePage.slug}`;
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
      router.push(`/portal/resources?section=${section}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={section}
          onValueChange={(v) => v && router.push(`/portal/resources?section=${v}`)}
        >
          <TabsList>
            <TabsTrigger value="consultant">Consultant Resources</TabsTrigger>
            {canViewPm && <TabsTrigger value="pm">PM Resources</TabsTrigger>}
          </TabsList>
        </Tabs>

        {canEdit && <PageDialog section={section} pages={pages} />}
      </div>

      <div className="grid items-start gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-[22px] border bg-card p-3 md:sticky md:top-0">
          <PageTree
            pages={pages}
            selectedSlug={activeSlug}
            onSelect={selectPage}
            canEdit={canEdit}
          />
        </aside>

        <div className="min-w-0 rounded-[22px] border bg-card p-6 md:p-8">
          {!activePage ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <BookOpen className="size-10 text-muted-foreground" aria-hidden />
              <p className="text-lg font-semibold">Nothing here yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {canEdit
                  ? "Use New page above to write the first guide for this section."
                  : "Guides will show up here once an exec adds them."}
              </p>
            </div>
          ) : (
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_200px]">
              <div className="min-w-0 max-w-3xl space-y-5">
                {parent && (
                  <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
                    <button type="button" className="hover:underline" onClick={() => selectPage(parent.slug)}>
                      {parent.title}
                    </button>
                    <ChevronRight className="size-3.5" aria-hidden />
                    <span className="text-foreground">{activePage.title}</span>
                  </nav>
                )}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-3xl leading-tight">{activePage.title}</h2>
                    <Badge variant="muted" className="mt-2">
                      Updated {format(new Date(activePage.updated_at), "MMM d, yyyy")}
                      {activePage.updated_by_profile && ` by ${activePage.updated_by_profile.name}`}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label="Copy link to this page" onClick={copyLink}>
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
                        <Button variant="ghost" size="icon-sm" aria-label="Delete page" onClick={() => setDeleteOpen(true)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {activePage.body ? (
                  <div className="text-base leading-relaxed">
                    <MarkdownContent body={activePage.body} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">This page is empty.</p>
                )}

                {children.length > 0 && (
                  <section aria-label="In this section" className="space-y-2 border-t pt-5">
                    <h3 className="text-base font-semibold">In this section</h3>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {children.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => selectPage(c.slug)}
                            className="flex w-full items-center justify-between gap-2 rounded-[18px] border bg-background px-4 py-3 text-left text-sm font-medium hover:bg-muted"
                          >
                            <span className="truncate">{c.title}</span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              {outline.length > 1 && (
                <nav aria-label="On this page" className="hidden text-sm xl:sticky xl:top-0 xl:block xl:self-start">
                  <p className="mb-2 font-semibold">On this page</p>
                  <ul className="space-y-1.5 border-l pl-3">
                    {outline.map((o, i) => (
                      <li key={`${o.id}-${i}`} style={{ paddingLeft: `${(o.level - 1) * 0.75}rem` }}>
                        <a href={`#${o.id}`} className="text-muted-foreground hover:text-foreground">
                          {o.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
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
