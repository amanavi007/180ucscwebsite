"use client";

import { useState } from "react";
import { PhotoPlaceholder } from "@/components/marketing/photo-placeholder";
import { cn } from "@/lib/utils";

export function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.45-2.14 2.94v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  );
}

export function TeamMemberCard({
  name,
  subtitle,
  bio,
  linkedin,
  photoUrl,
}: {
  name: string;
  subtitle: string;
  bio: string | null;
  linkedin: string;
  photoUrl: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="group">
      <div
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative overflow-hidden rounded-[1.25rem] transition-all duration-300 group-focus-within:-translate-y-1 [@media(hover:hover)]:group-hover:-translate-y-1 [@media(hover:hover)]:group-hover:shadow-xl [@media(hover:hover)]:group-hover:shadow-primary/25",
          open && "-translate-y-1 shadow-xl shadow-primary/25",
        )}
      >
        <PhotoPlaceholder label={`Photo: ${name}`} src={photoUrl} className="aspect-[4/5] w-full rounded-none" />
        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-end gap-2 bg-gradient-to-t from-primary/90 via-primary/40 to-transparent p-4 opacity-0 transition-opacity duration-300 group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100",
            open && "opacity-100",
          )}
        >
          {bio && <p className="text-sm leading-snug text-pretty text-white">{bio}</p>}
          <a
            href={linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${name} on LinkedIn`}
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0a66c2] shadow-sm"
          >
            <LinkedinIcon className="size-3.5" />
            View LinkedIn
          </a>
        </div>
      </div>
      <div className="mt-3 flex items-start justify-between gap-3 px-0.5">
        <div>
          <h3 className="leading-tight font-semibold">{name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <a
          href={linkedin}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${name} on LinkedIn`}
          className="mt-0.5 shrink-0 text-[#0a66c2] transition-colors hover:text-[#074a8c]"
        >
          <LinkedinIcon className="size-5" />
        </a>
      </div>
    </div>
  );
}
