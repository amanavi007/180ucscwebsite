"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteEventAction, reorderCategoriesAction, setCategoryArchivedAction } from "@/actions/recruit";
import type { RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import type { RubricRow } from "@/lib/data/recruit-scoring";
import type { RecruitSettings } from "@/lib/recruit-settings";
import type { Stage } from "@/lib/recruit-scoring";
import { RECRUIT_SECTIONS, formatPoints } from "@/lib/recruit";
import { formatDateLong } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryDialog } from "./category-dialog";
import { EventDialog } from "./event-dialog";
import { RubricEditor, ScoringSettingsCard } from "./rubric-editor";

export function SetupView({
  quarterId,
  categories,
  events,
  rubrics,
  settings,
}: {
  quarterId: string;
  categories: RecruitCategory[];
  events: RecruitEvent[];
  rubrics: Record<Stage, RubricRow>;
  settings: RecruitSettings;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  function run(action: () => Promise<{ error?: string }>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (success) toast.success(success);
      router.refresh();
    });
  }

  function move(index: number, delta: -1 | 1) {
    const ids = active.map((c) => c.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderCategoriesAction(ids));
  }

  return (
    <div className="mt-4 grid items-start gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Point categories</CardTitle>
            <CardDescription>
              The reasons you can give points for. Archived categories keep their history but can&apos;t be picked for new entries.
            </CardDescription>
          </div>
          <CategoryDialog
            trigger={
              <Button size="sm">
                <Plus />
                New category
              </Button>
            }
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y rounded-lg border">
            {active.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 p-2.5 text-sm">
                <div className="flex flex-col">
                  <Button size="icon-xs" variant="ghost" aria-label={`Move ${c.name} up`} disabled={isPending || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={`Move ${c.name} down`} disabled={isPending || i === active.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {RECRUIT_SECTIONS.find((s) => s.value === c.section)?.label}
                  </div>
                </div>
                <Badge variant={c.defaultPoints < 0 ? "destructive" : "secondary"}>{formatPoints(c.defaultPoints)}</Badge>
                <CategoryDialog
                  category={c}
                  trigger={
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${c.name}`}>
                      <Pencil />
                    </Button>
                  }
                />
                {c.systemKey ? (
                  <Badge variant="outline" title="The portal uses this category automatically, so it can be renamed but not archived.">
                    Used automatically
                  </Badge>
                ) : (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Archive ${c.name}`}
                    disabled={isPending}
                    onClick={() => run(() => setCategoryArchivedAction(c.id, true), `${c.name} archived.`)}
                  >
                    <Archive />
                  </Button>
                )}
              </li>
            ))}
            {active.length === 0 && <li className="p-3 text-sm text-muted-foreground">No categories yet. Add the first one.</li>}
          </ul>

          {archived.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Archived</h4>
              <ul className="divide-y rounded-lg border">
                {archived.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 p-2.5 text-sm text-muted-foreground">
                    <span>{c.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => run(() => setCategoryArchivedAction(c.id, false), `${c.name} restored.`)}
                    >
                      <ArchiveRestore />
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Events this quarter</CardTitle>
            <CardDescription>Dated occurrences, like Info Session 1. Attach points to them to track who showed up.</CardDescription>
          </div>
          <EventDialog
            quarterId={quarterId}
            categories={categories}
            trigger={
              <Button size="sm" disabled={active.length === 0}>
                <Plus />
                New event
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet. Add one when you schedule an info session or mixer.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                  <div>
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {categoryName.get(e.categoryId) ?? "Unknown category"} · {formatDateLong(e.date)}
                    </div>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${e.name}`}
                    disabled={isPending}
                    onClick={() => run(() => deleteEventAction(e.id), "Event deleted.")}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <RubricEditor rubric={rubrics.resume} />
      <RubricEditor rubric={rubrics.interview} />
      <ScoringSettingsCard settings={settings} />
    </div>
  );
}
