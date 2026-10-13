"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { ApplicationAnswers } from "@/lib/data/recruit-review";
import { driveEmbedUrl } from "@/lib/recruit-applications";
import { Button } from "@/components/ui/button";

const ESSAYS: { key: "essayWhy" | "essayTeamwork" | "essayBring"; title: string }[] = [
  { key: "essayWhy", title: "Why they want to join" },
  { key: "essayTeamwork", title: "A time they worked on a team" },
  { key: "essayBring", title: "What they would bring to a diverse team" },
];

export function ApplicationCard({
  name,
  email,
  application,
  applicationLink,
}: {
  name: string;
  email: string | null;
  application: ApplicationAnswers | null;
  applicationLink: string | null;
}) {
  const [showResume, setShowResume] = useState(false);
  const resumeUrl = application?.resumeUrl ?? applicationLink;
  const embed = driveEmbedUrl(resumeUrl);
  const details = [email, application?.graduationTerm, application?.howHeard && `Heard via ${application.howHeard}`].filter(Boolean);

  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h3 className="text-xl font-semibold tracking-tight">{name}</h3>
        {details.length > 0 && <p className="text-sm text-muted-foreground">{details.join(" · ")}</p>}
      </header>

      {resumeUrl && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {embed && (
              <Button size="sm" variant="outline" onClick={() => setShowResume((v) => !v)}>
                {showResume ? "Hide resume" : "Show resume"}
              </Button>
            )}
            <a
              href={resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              Open resume in a new tab <ExternalLink className="size-3.5" />
            </a>
          </div>
          {embed && showResume && <iframe src={embed} title={`${name} resume`} className="h-[32rem] w-full rounded-lg border" />}
        </section>
      )}

      {application ? (
        ESSAYS.map(({ key, title }) => (
          <section key={key} className="space-y-1.5">
            <h4 className="text-sm font-medium">{title}</h4>
            <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {application[key] ?? <span className="text-muted-foreground">No answer</span>}
            </p>
          </section>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No application answers were imported for this applicant.</p>
      )}
    </article>
  );
}
