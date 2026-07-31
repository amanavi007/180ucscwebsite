"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FolderKanban,
  ListTodo,
  BookOpen,
  User,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { globalSearch, type SearchResult } from "@/actions/search";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NAV_LINKS, ADMIN_NAV_LINKS, type NavLink } from "@/components/layout/nav-links";

const TYPE_ICON: Record<SearchResult["type"], LucideIcon> = {
  project: FolderKanban,
  task: ListTodo,
  wiki: BookOpen,
  member: User,
  client: Building2,
};
const TYPE_HEADING: Record<SearchResult["type"], string> = {
  client: "Clients",
  project: "Projects",
  task: "Tasks",
  wiki: "Resources",
  member: "People",
};
const RESULT_ORDER: SearchResult["type"][] = ["client", "project", "task", "wiki", "member"];

interface PaletteItem {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle: string | null;
  href: string;
}

interface Section {
  heading: string;
  items: PaletteItem[];
}

/**
 * Substring match ranks highest (earlier position wins ties); then
 * "all words present, any order" for reordered multi-word queries; then a
 * character-subsequence fallback so loose/abbreviated typing still finds
 * the right page. Cheap enough to run on every keystroke against the small
 * static nav list.
 */
function fuzzyScore(query: string, target: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = target.toLowerCase();

  const idx = t.indexOf(q);
  if (idx !== -1) return 1000 - idx;

  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => t.includes(w))) return 500;

  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += lastMatch === ti - 1 ? 2 : 1;
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : null;
}

function matchPages(query: string, isExec: boolean): { link: NavLink; isAdmin: boolean }[] {
  const topLevel = NAV_LINKS.filter((l) => (!l.execOnly || isExec) && l.href !== "/admin").map(
    (l) => ({ link: l, isAdmin: false }),
  );

  if (!query.trim()) return topLevel.slice(0, 6);

  const adminSub = isExec ? ADMIN_NAV_LINKS.map((l) => ({ link: l, isAdmin: true })) : [];
  return [...topLevel, ...adminSub]
    .map((x) => ({ ...x, score: fuzzyScore(query, `${x.link.label} ${x.link.keywords ?? ""}`) }))
    .filter((x): x is typeof x & { score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

export function CommandPalette({
  open,
  onOpenChange,
  isExec,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isExec: boolean;
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
        setIsSearching(false);
      });
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, canSearch]);

  const pageMatches = matchPages(query, isExec);

  const sections: Section[] = [];
  if (pageMatches.length > 0) {
    sections.push({
      heading: query.trim() ? "Pages" : "Quick links",
      items: pageMatches.map(({ link, isAdmin }) => ({
        key: `page-${link.href}`,
        icon: link.icon,
        title: link.label,
        subtitle: isAdmin ? "Admin" : null,
        href: link.href,
      })),
    });
  }
  if (canSearch) {
    const byType: Record<SearchResult["type"], SearchResult[]> = {
      client: [],
      project: [],
      task: [],
      wiki: [],
      member: [],
    };
    for (const r of results) byType[r.type].push(r);
    for (const type of RESULT_ORDER) {
      if (byType[type].length > 0) {
        sections.push({
          heading: TYPE_HEADING[type],
          items: byType[type].map((r) => ({
            key: `${r.type}-${r.id}`,
            icon: TYPE_ICON[r.type],
            title: r.title,
            subtitle: r.subtitle,
            href: r.href,
          })),
        });
      }
    }
  }
  const flatItems = sections.flatMap((s) => s.items);
  const clampedIndex = Math.min(activeIndex, Math.max(flatItems.length - 1, 0));

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
    onOpenChange(next);
  }

  function go(item: PaletteItem) {
    handleOpenChange(false);
    router.push(item.href);
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatItems[clampedIndex]) {
      e.preventDefault();
      go(flatItems[clampedIndex]);
    }
  }

  let renderIndex = -1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search pages, projects, tasks, resources, people..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            className="h-11 border-none px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-96 overflow-y-auto p-1.5">
          {flatItems.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {canSearch && isSearching ? "Searching..." : `No results for "${query}".`}
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.heading} className="mb-1 last:mb-0">
                <p className="px-2.5 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {section.heading}
                </p>
                {section.items.map((item) => {
                  renderIndex++;
                  const i = renderIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => go(item)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm",
                        i === clampedIndex ? "bg-muted" : "hover:bg-muted/50",
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {item.subtitle && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {item.subtitle}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
