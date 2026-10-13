"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { deleteEventAction, reorderCategoriesAction, setCategoryArchivedAction } from "@/actions/recruit";
import type { RecruitCategory, RecruitEvent } from "@/lib/data/recruit";
import type { RubricRow, ScoringBundle } from "@/lib/data/recruit-scoring";
import type { RecruitSettings } from "@/lib/recruit-settings";
import type { Stage } from "@/lib/recruit-scoring";
import { RECRUIT_SECTIONS, formatPoints } from "@/lib/recruit";
import { formatDateLong } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { CategoryDialog } from "./category-dialog";
import { EventDialog } from "./event-dialog";
import { ReviewSettingsCard } from "./review-settings-card";
import { RubricEditor, ScoringSettingsCard } from "./rubric-editor";
import { Segmented } from "./segmented";

type Section = "categories" | "events" | "reviewers" | "rubric" | "adjustment";

const NAV: { group: string; items: { value: Section; label: string }[] }[] = [
  {
    group: "Points",
    items: [
      { value: "categories", label: "Categories" },
      { value: "events", label: "Events" },
    ],
  },
  {
    group: "Reviews",
    items: [
      { value: "reviewers", label: "Reviewers" },
      { value: "rubric", label: "Rubric" },
      { value: "adjustment", label: "Score adjustment" },
    ],
  },
];

const textButton = "text-sm font-medium underline-offset-2 hover:underline disabled:opacity-50";

export function SetupView({
  quarterId,
  categories,
  events,
  rubrics,
  settings,
  reviewSetup,
}: {
  quarterId: string;
  categories: RecruitCategory[];
  events: RecruitEvent[];
  rubrics: Record<Stage, RubricRow>;
  settings: RecruitSettings;
  reviewSetup: ScoringBundle["reviewSetup"];
}) {
  const [section, setSection] = useState<Section>("categories");
  const [rubricStage, setRubricStage] = useState<Stage>("resume");
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
    <div className="mt-8 flex flex-wrap items-start gap-x-12 gap-y-6">
      <nav aria-label="Settings sections" className="flex w-52 shrink-0 flex-col gap-1">
        {NAV.map((g, i) => (
          <div key={g.group} className={`flex flex-col gap-1 ${i > 0 ? "mt-5" : ""}`}>
            <span className="px-3 pb-1 text-[13px] font-semibold text-muted-foreground">{g.group}</span>
            {g.items.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-current={section === item.value}
                onClick={() => setSection(item.value)}
                className="rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground/80 transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-accent aria-[current=true]:font-semibold aria-[current=true]:text-accent-foreground"
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="min-w-0 flex-1 basis-[32rem]">
        {section === "categories" && (
          <section aria-labelledby="categories-h">
            <div className="flex items-start justify-between gap-6">
              <div className="max-w-xl">
                <h2 id="categories-h" className="text-xl font-semibold">
                  Point categories
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  The reasons you can give points for. Archived categories keep their history but can&apos;t be used for new points.
                </p>
              </div>
              <CategoryDialog trigger={<Button variant="outline" size="lg">New category</Button>} />
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border bg-card">
              {active.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No categories yet. Add the first one.</p>
              ) : (
                <ul>
                  {active.map((c, i) => (
                    <li key={c.id} className="flex items-center gap-4 border-b px-5 py-3.5 last:border-b-0">
                      <div className="flex flex-col">
                        <Button size="icon-xs" variant="ghost" aria-label={`Move ${c.name} up`} disabled={isPending || i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Move ${c.name} down`}
                          disabled={isPending || i === active.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown />
                        </Button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{c.name}</div>
                        <div className="text-[13px] text-muted-foreground">{RECRUIT_SECTIONS.find((s) => s.value === c.section)?.label}</div>
                      </div>
                      <span className={`w-12 text-sm font-semibold tabular-nums ${c.defaultPoints < 0 ? "text-status-bad-foreground" : ""}`}>
                        {formatPoints(c.defaultPoints)}
                      </span>
                      {c.systemKey ? (
                        <span className="text-[13px] text-muted-foreground" title="The portal uses this category automatically, so it can be renamed but not archived.">
                          Used automatically
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => run(() => setCategoryArchivedAction(c.id, true), `${c.name} archived.`)}
                          className={`${textButton} text-muted-foreground`}
                        >
                          Archive
                        </button>
                      )}
                      <CategoryDialog
                        category={c}
                        trigger={
                          <button type="button" aria-label={`Edit ${c.name}`} className={`${textButton} text-link`}>
                            Edit
                          </button>
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {archived.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-link">
                  Show {archived.length} archived categor{archived.length === 1 ? "y" : "ies"}
                </summary>
                <ul className="mt-3 overflow-hidden rounded-xl border bg-card">
                  {archived.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 border-b px-5 py-3 text-sm text-muted-foreground last:border-b-0">
                      <span>{c.name}</span>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => setCategoryArchivedAction(c.id, false), `${c.name} restored.`)}
                        className={`${textButton} text-link`}
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        {section === "events" && (
          <section aria-labelledby="events-h">
            <div className="flex items-start justify-between gap-6">
              <div className="max-w-xl">
                <h2 id="events-h" className="text-xl font-semibold">
                  Events this quarter
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Dated occurrences, like Info Session 1. Attach points to them to track who showed up.
                </p>
              </div>
              <EventDialog
                quarterId={quarterId}
                categories={categories}
                trigger={
                  <Button variant="outline" size="lg" disabled={active.length === 0}>
                    New event
                  </Button>
                }
              />
            </div>
            <div className="mt-6 overflow-hidden rounded-xl border bg-card">
              {events.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No events yet. Add one when you schedule an info session or mixer.</p>
              ) : (
                <ul>
                  {events.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-4 border-b px-5 py-3.5 last:border-b-0">
                      <div>
                        <div className="text-sm font-medium">{e.name}</div>
                        <div className="text-[13px] text-muted-foreground">
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
            </div>
          </section>
        )}

        {section === "reviewers" && (
          <div className="max-w-2xl">
            <ReviewSettingsCard setup={reviewSetup} />
          </div>
        )}

        {section === "rubric" && (
          <div className="max-w-2xl space-y-4">
            <Segmented
              label="Rubric"
              value={rubricStage}
              onChange={setRubricStage}
              options={[
                { value: "resume", label: "Applications" },
                { value: "interview", label: "Interviews" },
              ]}
            />
            <RubricEditor key={rubricStage} rubric={rubrics[rubricStage]} />
          </div>
        )}

        {section === "adjustment" && (
          <div className="max-w-2xl">
            <ScoringSettingsCard settings={settings} />
          </div>
        )}
      </div>
    </div>
  );
}
