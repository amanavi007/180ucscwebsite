"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import type { ApplicationAnswers } from "@/lib/data/recruit-review";
import { driveEmbedUrl } from "@/lib/recruit-applications";
import {
  leadSentence,
  readingMinutes,
  SHORT_ANSWER_WORDS,
  splitParagraphs,
  wordCount,
} from "@/lib/recruit-answer-text";
import type { AnswerKey } from "@/lib/recruit-rubric-levels";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ESSAYS: {
  key: Exclude<AnswerKey, "resume">;
  field: "essayWhy" | "essayTeamwork" | "essayBring";
  title: string;
  short: string;
}[] = [
  {
    key: "why",
    field: "essayWhy",
    title: "Why they want to join",
    short: "Why join",
  },
  {
    key: "teamwork",
    field: "essayTeamwork",
    title: "A time they worked on a team",
    short: "Team example",
  },
  {
    key: "bring",
    field: "essayBring",
    title: "What they would bring to a diverse team",
    short: "What they bring",
  },
];

const sectionId = (key: AnswerKey) => `answer-${key}`;

/** Sections the J and K shortcuts walk through. */
export const SECTION_SELECTOR = "[data-answer-section]";

export function ApplicationCard({
  name,
  email,
  application,
  applicationLink,
  scoredAnswers = [],
  scoredIn = {},
}: {
  name: string;
  email: string | null;
  application: ApplicationAnswers | null;
  applicationLink: string | null;
  /** Answers whose criterion the reviewer has scored. */
  scoredAnswers?: AnswerKey[];
  /** Criterion names by answer, for the "Scored in …" line. */
  scoredIn?: Partial<Record<AnswerKey, string>>;
}) {
  const [showResume, setShowResume] = useState(false);
  const [current, setCurrent] = useState<AnswerKey>("why");
  const resumeUrl = application?.resumeUrl ?? applicationLink;
  const embed = driveEmbedUrl(resumeUrl);
  const details = [
    email,
    application?.graduationTerm,
    application?.howHeard && `Heard via ${application.howHeard}`,
  ].filter(Boolean);
  const scored = new Set(scoredAnswers);

  // Keeps the outline on whichever answer is being read.
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>(SECTION_SELECTOR);
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (hit)
          setCurrent(
            hit.target.getAttribute("data-answer-section") as AnswerKey,
          );
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const outline: { key: AnswerKey; label: string; meta: string }[] = [
    ...ESSAYS.map((e) => {
      const words = wordCount(application?.[e.field] ?? null);
      return {
        key: e.key,
        label: e.short,
        meta: words > 0 ? `${words} words` : "No answer",
      };
    }),
    { key: "resume", label: "Resume", meta: resumeUrl ? "PDF" : "No link" },
  ];

  function jump(key: AnswerKey) {
    document
      .getElementById(sectionId(key))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrent(key);
  }

  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h3 className="text-2xl font-semibold tracking-tight">{name}</h3>
        {details.length > 0 && (
          <p className="text-sm text-muted-foreground">{details.join(" · ")}</p>
        )}
      </header>

      {/* One row of tabs that stays in view while you read, so the page stays two columns wide. */}
      <nav
        aria-label="Application sections"
        className="sticky top-0 z-10 -mx-2 flex flex-wrap gap-1 border-b bg-background/95 px-2 py-2 backdrop-blur"
      >
        {outline.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => jump(o.key)}
            aria-current={current === o.key}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] text-muted-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-muted aria-[current=true]:text-foreground"
          >
            <span className="font-medium">{o.label}</span>
            <span className="text-xs tabular-nums">{o.meta}</span>
            {scored.has(o.key) && (
              <Check
                className="size-3.5 shrink-0 text-primary"
                aria-label="Scored"
              />
            )}
          </button>
        ))}
      </nav>

      <div>
        {application || resumeUrl ? (
          <div className="min-w-0 space-y-9">
            {ESSAYS.map(({ key, field, title }) => {
              const text = application?.[field] ?? null;
              const words = wordCount(text);
              return (
                <section
                  key={key}
                  id={sectionId(key)}
                  data-answer-section={key}
                  className="scroll-mt-16"
                >
                  <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2.5">
                    <h4 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {title}
                    </h4>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                      {words === 0 ? (
                        <span className="rounded-md bg-status-warn px-2 py-0.5 font-medium text-status-warn-foreground">
                          No answer
                        </span>
                      ) : (
                        <>
                          {words < SHORT_ANSWER_WORDS && (
                            <span className="rounded-md bg-status-warn px-2 py-0.5 font-medium text-status-warn-foreground">
                              Short answer
                            </span>
                          )}
                          {words} words · {readingMinutes(words)} min read
                        </>
                      )}
                    </span>
                  </div>
                  {text && (
                    <div className="grid max-w-[64ch] gap-5 text-[15.5px] leading-[1.75] text-foreground/90">
                      {splitParagraphs(text).map((p, i) => {
                        // The opening sentence stands out so a skim of the page still tells you what each answer is about.
                        const { lead, rest } =
                          i === 0 ? leadSentence(p) : { lead: "", rest: p };
                        return (
                          <p key={i} className="text-pretty">
                            {lead && (
                              <span className="font-semibold text-foreground">
                                {lead}{" "}
                              </span>
                            )}
                            {rest}
                          </p>
                        );
                      })}
                    </div>
                  )}
                  {scoredIn[key] && (
                    <p className="mt-3.5 text-[13px] text-muted-foreground">
                      Scored in {scoredIn[key]}
                    </p>
                  )}
                </section>
              );
            })}

            <section
              id={sectionId("resume")}
              data-answer-section="resume"
              className="scroll-mt-16"
            >
              <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2.5">
                <h4 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Resume
                </h4>
              </div>
              {resumeUrl ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {embed && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowResume((v) => !v)}
                      >
                        {showResume ? "Hide resume" : "Show resume"}
                      </Button>
                    )}
                    <a
                      href={resumeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                    >
                      Open resume in a new tab{" "}
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                  {embed && showResume && (
                    <iframe
                      src={embed}
                      title={`${name} resume`}
                      className="h-[min(48rem,80vh)] w-full rounded-lg border"
                    />
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No resume link was submitted.
                </p>
              )}
              {scoredIn.resume && (
                <p className="mt-3.5 text-[13px] text-muted-foreground">
                  Scored in {scoredIn.resume}
                </p>
              )}
            </section>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No application answers were imported for this applicant.
          </p>
        )}
      </div>
    </article>
  );
}
