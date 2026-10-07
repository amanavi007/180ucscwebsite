"use client";

import { useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import type { ApplicantRow, RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import { rankByTotal, ringFraction } from "@/lib/recruit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScoreRing } from "./score-ring";

type Filter = "all" | "engaged" | "none";
type Sort = "points" | "name";

export function ApplicantsView({
  rows,
  duplicateCount,
  onReviewDuplicates,
  onSelect,
  addButton,
}: {
  quarterId: string;
  rows: ApplicantRow[];
  categories: RecruitCategory[];
  events: RecruitEvent[];
  duplicateCount: number;
  onReviewDuplicates: () => void;
  onSelect: (id: string) => void;
  addButton: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("points");

  const engagedCount = rows.filter((r) => r.entries.some((e) => !e.voidedAt && e.points > 0)).length;
  const counts: Record<Filter, number> = { all: rows.length, engaged: engagedCount, none: rows.length - engagedCount };
  const max = Math.max(0, ...rows.map((r) => r.total));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      const engaged = r.entries.some((e) => !e.voidedAt && e.points > 0);
      if (filter === "engaged" && !engaged) return false;
      if (filter === "none" && engaged) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.email ?? "").includes(q) || r.aliases.some((a) => a.includes(q));
    });
    return sort === "points"
      ? rankByTotal(filtered)
      : [...filtered].sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ ...r, rank: 0 }));
  }, [rows, search, filter, sort]);

  if (rows.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <UserPlus className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No applicants yet this quarter</p>
            <p className="text-sm text-muted-foreground">
              Add the first one by hand. Applicants are also created automatically as you give points or import lists.
            </p>
          </div>
          {addButton}
        </CardContent>
      </Card>
    );
  }

  const funnel: { key: Filter; label: string }[] = [
    { key: "all", label: "All applicants" },
    { key: "engaged", label: "Engaged" },
    { key: "none", label: "No points yet" },
  ];

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {funnel.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-xl border p-3 text-left transition-colors ${
              filter === f.key ? "border-foreground" : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="text-xl font-semibold tabular-nums">{counts[f.key]}</div>
            <div className="text-xs text-muted-foreground">{f.label}</div>
          </button>
        ))}
      </div>

      {duplicateCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
          <span>
            <b>To do:</b> {duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"} to check
          </span>
          <Button size="sm" variant="outline" onClick={onReviewDuplicates}>
            Review
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search applicants"
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={sort} onValueChange={(v) => v && setSort(v as Sort)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue>{(value: string) => (value === "name" ? "Sort: Name A–Z" : "Sort: Most points")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="points">Sort: Most points</SelectItem>
            <SelectItem value="name">Sort: Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No one matches that search.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {visible.map((r) => {
            const categoriesSeen = [...new Set(r.entries.filter((e) => !e.voidedAt).map((e) => e.categoryName))];
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
                >
                  <span className="w-6 text-sm tabular-nums text-muted-foreground">{sort === "points" ? r.rank : ""}</span>
                  <ScoreRing value={r.total} fraction={ringFraction(r.total, max)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{r.name}</span>
                      {r.hasPrevious && <Badge variant="secondary">Previously applied</Badge>}
                      {!r.email && <Badge variant="outline">No email yet</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {categoriesSeen.length > 0 ? categoriesSeen.join(" · ") : "No points yet"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
