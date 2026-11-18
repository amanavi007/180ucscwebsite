"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const STORAGE_KEY = "jc-name-check";

/** A paper-style checklist for putting faces to names. It only remembers ticks in this browser; it never marks attendance. */
export function JcNameCheck({
  people,
  open,
  onOpenChange,
}: {
  people: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Read once on mount. The list is inside a closed dialog at that point, so nothing on screen depends on it.
  const [ticked, setTicked] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      return new Set(Array.isArray(saved) ? saved.filter((v): v is string => typeof v === "string") : []);
    } catch {
      return new Set();
    }
  });
  const [search, setSearch] = useState("");

  function save(next: Set<string>) {
    setTicked(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Private window: ticks just won't survive a refresh.
    }
  }

  function toggle(id: string) {
    const next = new Set(ticked);
    if (!next.delete(id)) next.add(id);
    save(next);
  }

  const sorted = useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name)), [people]);
  const q = search.trim().toLowerCase();
  const shown = q ? sorted.filter((p) => p.name.toLowerCase().includes(q)) : sorted;
  const here = people.filter((p) => ticked.has(p.id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Name check</DialogTitle>
          <DialogDescription>
            Tick people off as you meet them. This is only a reminder for you and does not record attendance.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Find a name" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {here} of {people.length} met
          </span>
        </div>
        <ul className="max-h-[50dvh] min-w-0 divide-y overflow-y-auto rounded-lg border">
          {shown.map((p) => {
            const done = ticked.has(p.id);
            return (
              <li key={p.id}>
                <label className="flex min-w-0 cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-accent">
                  <Checkbox checked={done} onCheckedChange={() => toggle(p.id)} />
                  <span className={`min-w-0 flex-1 break-words text-sm ${done ? "text-muted-foreground" : "font-medium"}`}>{p.name}</span>
                  {done && <Badge variant="ok">Here</Badge>}
                </label>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No one matches.</li>}
        </ul>
        {here > 0 && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => save(new Set())}>
            Clear all ticks
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
