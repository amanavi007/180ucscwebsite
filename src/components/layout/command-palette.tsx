"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, FolderKanban, ListTodo, BookOpen, User } from "lucide-react";
import { globalSearch, type SearchResult } from "@/actions/search";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TYPE_ICON = { project: FolderKanban, task: ListTodo, wiki: BookOpen, member: User } as const;
const TYPE_LABEL = { project: "Project", task: "Task", wiki: "Resource", member: "Member" } as const;

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();

  const canSearch = query.trim().length >= 2;

  useEffect(() => {
    if (!canSearch) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- debounced search loading indicator
    setIsSearching(true);
    const timeout = setTimeout(() => {
      globalSearch(query).then((r) => {
        setResults(r);
        setActiveIndex(0);
        setIsSearching(false);
      });
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, canSearch]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
    onOpenChange(next);
  }

  function go(result: SearchResult) {
    handleOpenChange(false);
    router.push(result.href);
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      go(results[activeIndex]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search projects, tasks, resources, people..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            className="h-11 border-none px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {!canSearch ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search.
            </p>
          ) : isSearching ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Searching...</p>
          ) : results.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No results for &quot;{query}&quot;.
            </p>
          ) : (
            results.map((r, i) => {
              const Icon = TYPE_ICON[r.type];
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  type="button"
                  onClick={() => go(r)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm",
                    i === activeIndex ? "bg-muted" : "hover:bg-muted/50",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.subtitle ?? TYPE_LABEL[r.type]}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
