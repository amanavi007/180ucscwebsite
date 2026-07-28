"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const components = {
  p: (props: React.ComponentProps<"p">) => <p className="mb-3 last:mb-0" {...props} />,
  ul: (props: React.ComponentProps<"ul">) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0" {...props} />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0" {...props} />
  ),
  li: ({ className, ...props }: React.ComponentProps<"li">) => (
    <li
      className={cn(className?.includes("task-list-item") && "list-none pl-0", className)}
      {...props}
    />
  ),
  input: (props: React.ComponentProps<"input">) => (
    <input className="mr-1.5 -mt-0.5 inline-block size-3.5 align-middle accent-primary" disabled {...props} />
  ),
  h1: (props: React.ComponentProps<"h1">) => (
    <h1 className="mt-6 mb-3 text-xl font-semibold first:mt-0" {...props} />
  ),
  h2: (props: React.ComponentProps<"h2">) => (
    <h2 className="mt-6 mb-2 text-lg font-semibold first:mt-0" {...props} />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0" {...props} />
  ),
  a: (props: React.ComponentProps<"a">) => (
    <a className="underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />
  ),
  strong: (props: React.ComponentProps<"strong">) => (
    <strong className="font-semibold" {...props} />
  ),
  code: (props: React.ComponentProps<"code">) => (
    <code className="rounded bg-muted px-1 py-0.5 text-xs" {...props} />
  ),
  blockquote: (props: React.ComponentProps<"blockquote">) => (
    <blockquote className="border-l-2 pl-3 text-muted-foreground" {...props} />
  ),
  hr: (props: React.ComponentProps<"hr">) => <hr className="my-4 border-border" {...props} />,
  table: (props: React.ComponentProps<"table">) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props: React.ComponentProps<"th">) => (
    <th className="border-b px-2 py-1 text-left font-semibold" {...props} />
  ),
  td: (props: React.ComponentProps<"td">) => <td className="border-b px-2 py-1" {...props} />,
};

export function MarkdownContent({ body }: { body: string }) {
  return (
    <div className="text-sm text-foreground/90">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </Markdown>
    </div>
  );
}
