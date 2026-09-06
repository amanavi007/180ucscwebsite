"use client";

import { cn } from "@/lib/utils";
import type { WikiPageWithAuthor } from "@/lib/data/types";

function TreeNode({
  page,
  childrenByParent,
  selectedSlug,
  depth,
  onSelect,
}: {
  page: WikiPageWithAuthor;
  childrenByParent: Map<string | null, WikiPageWithAuthor[]>;
  selectedSlug: string | null;
  depth: number;
  onSelect: (slug: string) => void;
}) {
  const children = childrenByParent.get(page.id) ?? [];
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(page.slug)}
        style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
        className={cn(
          "block w-full truncate rounded-md py-1.5 pr-2 text-left text-sm transition-colors hover:bg-muted",
          selectedSlug === page.slug
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground",
        )}
      >
        {page.title}
      </button>
      {children.map((child) => (
        <TreeNode
          key={child.id}
          page={child}
          childrenByParent={childrenByParent}
          selectedSlug={selectedSlug}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function PageTree({
  pages,
  selectedSlug,
  onSelect,
}: {
  pages: WikiPageWithAuthor[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  const childrenByParent = new Map<string | null, WikiPageWithAuthor[]>();
  for (const page of pages) {
    const key = page.parent_id;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(page);
  }
  const topLevel = childrenByParent.get(null) ?? [];

  if (pages.length === 0) {
    return <p className="px-2 py-4 text-sm text-muted-foreground">No pages yet.</p>;
  }

  return (
    <div className="space-y-0.5">
      {topLevel.map((page) => (
        <TreeNode
          key={page.id}
          page={page}
          childrenByParent={childrenByParent}
          selectedSlug={selectedSlug}
          depth={0}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
