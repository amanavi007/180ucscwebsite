"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ListSearch } from "@/components/list-search";
import { useFilteredList } from "@/lib/use-filtered-list";
import { moveWikiPage } from "@/actions/wiki";
import type { WikiPageWithAuthor } from "@/lib/data/types";

function TreeNode({
  page,
  childrenByParent,
  selectedSlug,
  depth,
  onSelect,
  reorderable,
  onMove,
  isFirst,
  isLast,
}: {
  page: WikiPageWithAuthor;
  childrenByParent: Map<string | null, WikiPageWithAuthor[]>;
  selectedSlug: string | null;
  depth: number;
  onSelect: (slug: string) => void;
  reorderable: boolean;
  onMove: (pageId: string, direction: "up" | "down") => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const children = childrenByParent.get(page.id) ?? [];
  return (
    <div>
      <div className="group flex items-center gap-0.5" style={{ paddingLeft: `${0.5 + depth * 1}rem` }}>
        <button
          type="button"
          onClick={() => onSelect(page.slug)}
          className={cn(
            "min-w-0 flex-1 truncate rounded-md py-1.5 pr-2 text-left text-sm transition-colors hover:bg-muted",
            selectedSlug === page.slug
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {page.title}
        </button>
        {reorderable && (
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move "${page.title}" up`}
              disabled={isFirst}
              onClick={() => onMove(page.id, "up")}
            >
              <ChevronUp className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move "${page.title}" down`}
              disabled={isLast}
              onClick={() => onMove(page.id, "down")}
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      {children.map((child, index) => (
        <TreeNode
          key={child.id}
          page={child}
          childrenByParent={childrenByParent}
          selectedSlug={selectedSlug}
          depth={depth + 1}
          onSelect={onSelect}
          reorderable={reorderable}
          onMove={onMove}
          isFirst={index === 0}
          isLast={index === children.length - 1}
        />
      ))}
    </div>
  );
}

export function PageTree({
  pages,
  selectedSlug,
  onSelect,
  canEdit,
}: {
  pages: WikiPageWithAuthor[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { query, setQuery, filtered } = useFilteredList<WikiPageWithAuthor>(pages, ["title"]);
  const isSearching = query.trim().length > 0;

  function handleMove(pageId: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveWikiPage(pageId, direction);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (pages.length === 0) {
    return <p className="px-2 py-4 text-sm text-muted-foreground">No pages yet.</p>;
  }

  const childrenByParent = new Map<string | null, WikiPageWithAuthor[]>();
  for (const page of pages) {
    const key = page.parent_id;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(page);
  }
  const topLevel = childrenByParent.get(null) ?? [];
  const reorderable = canEdit && !isSearching;

  return (
    <div className="space-y-2">
      <ListSearch value={query} onChange={setQuery} placeholder="Search pages..." />

      {isSearching ? (
        <div className="space-y-0.5">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">No pages match.</p>
          ) : (
            filtered.map((page) => (
              <TreeNode
                key={page.id}
                page={page}
                childrenByParent={new Map()}
                selectedSlug={selectedSlug}
                depth={0}
                onSelect={onSelect}
                reorderable={false}
                onMove={handleMove}
                isFirst
                isLast
              />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-0.5">
          {topLevel.map((page, index) => (
            <TreeNode
              key={page.id}
              page={page}
              childrenByParent={childrenByParent}
              selectedSlug={selectedSlug}
              depth={0}
              onSelect={onSelect}
              reorderable={reorderable}
              onMove={handleMove}
              isFirst={index === 0}
              isLast={index === topLevel.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
