"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Square, SquarePen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MarkdownContent } from "@/components/markdown-content";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UsageRing } from "./usage-ring";
import { cn } from "@/lib/utils";
import { friendlyErrorResponse } from "@/lib/assistant/client-fetch";
import { ProposalCard } from "./proposal-card";
import { ToolCard } from "./tool-cards";

const MAX_CHARS = 2000;
const SUGGESTIONS = ["What's due?", "Upcoming events", "Which projects am I on?"];

class ThreadHolder {
  constructor(public id: string | null) {}
  set(id: string | null) {
    this.id = id;
  }
}

type ProposalOutput = { status?: string; proposalId?: string; preview?: string; warning?: string };

export function ChatPanel({
  greeting,
  firstName,
  execUsage,
}: {
  greeting: string;
  firstName: string;
  execUsage: { used: number; cap: number } | null;
}) {
  // Mutable holder (not a ref) so the transport closures below stay lint-clean.
  const [thread] = useState(() => new ThreadHolder(null));
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ threadId: thread.id }),
        fetch: async (url, init) => {
          const res = await fetch(url, init);
          const id = res.headers.get("x-thread-id");
          if (id) thread.set(id);
          return friendlyErrorResponse(res);
        },
      }),
  );

  const { messages, setMessages, sendMessage, status, error, regenerate, stop } = useChat({
    transport,
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const started = messages.length > 0;
  const busy = status === "submitted" || status === "streaming";
  const tooLong = input.length > MAX_CHARS;
  const capReached = !!error && /limit|midnight/i.test(error.message);

  // The composer remounts when the empty state gives way to the thread; keep the cursor in it.
  useEffect(() => {
    if (started) inputRef.current?.focus();
  }, [started]);

  function submit(text: string) {
    const t = text.trim();
    if (!t || busy || t.length > MAX_CHARS) return;
    sendMessage({ text: t });
    setInput("");
  }

  function newChat() {
    thread.set(null);
    setMessages([]);
  }

  const composer = (
    <form
      className={cn("w-full", started ? "mx-auto max-w-2xl" : "max-w-xl")}
      onSubmit={(e) => {
        e.preventDefault();
        submit(input);
      }}
    >
      <div
        className={cn(
          "flex items-end gap-2 border bg-card shadow-lg shadow-black/5 transition-shadow focus-within:ring-4 focus-within:ring-primary/15",
          started ? "rounded-3xl p-1.5 pl-4" : "rounded-3xl p-2.5 pl-5 ring-4 ring-primary/10",
        )}
      >
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          placeholder={started ? "Reply..." : "Ask anything about the quarter..."}
          rows={1}
          className={cn(
            "max-h-40 resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent",
            started ? "min-h-9 py-2" : "min-h-14 py-3 text-base",
          )}
        />
        {busy ? (
          <Button type="button" size="icon" variant="outline" className="rounded-full" onClick={() => stop()} aria-label="Stop">
            <Square className="size-4" />
          </Button>
        ) : (
          <Button type="submit" size="icon" className="rounded-full" disabled={!input.trim() || tooLong} aria-label="Send">
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
      {input.length > MAX_CHARS * 0.8 && (
        <p className={cn("mt-1 px-4 text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}>
          {input.length}/{MAX_CHARS}
        </p>
      )}
    </form>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {started && (
        <div className="flex h-8 items-center justify-end">
          <Button size="sm" variant="ghost" onClick={newChat} disabled={busy}>
            <SquarePen className="mr-1.5 size-4" /> New chat
          </Button>
        </div>
      )}

      {!started ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-2 text-center [background:radial-gradient(ellipse_60%_45%_at_50%_62%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)]">
          <div className="space-y-3">
            <h1 className="font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">
              {greeting},
              <br />
              <span className="text-primary">{firstName}.</span>
            </h1>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Ask about your projects, tasks and events. For changes, I&apos;ll propose them and you approve.
            </p>
          </div>
          {composer}
          <div className="flex max-w-xl flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="rounded-full border bg-background/60 px-3.5 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl space-y-6 py-4">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-3xl rounded-br-md bg-accent px-4 py-2 text-accent-foreground">
                      <p className="whitespace-pre-wrap text-sm">
                        {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-3">
                    <Avatar180 />
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                      {m.parts.map((part, i) => {
                        if (part.type === "text") return <MarkdownContent key={i} body={part.text} noImages />;
                        if (!part.type.startsWith("tool-")) return null;
                        const toolPart = part as { type: string; state: string; output?: unknown };
                        const toolName = toolPart.type.slice("tool-".length);
                        if (toolPart.state !== "output-available") {
                          return toolName.startsWith("propose_") ? null : (
                            <p key={i} className="text-xs text-muted-foreground">Looking that up...</p>
                          );
                        }
                        if (toolName.startsWith("propose_")) {
                          const out = toolPart.output as ProposalOutput;
                          if (out.status === "awaiting_user_approval" && out.proposalId && out.preview) {
                            return <ProposalCard key={i} proposalId={out.proposalId} preview={out.preview} warning={out.warning} />;
                          }
                          return null;
                        }
                        return <ToolCard key={i} toolName={toolName} output={toolPart.output} />;
                      })}
                    </div>
                  </div>
                ),
              )}

              {status === "submitted" && (
                <div className="flex items-center gap-3">
                  <Avatar180 />
                  <p className="text-sm text-muted-foreground">Thinking...</p>
                </div>
              )}
              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                  <p>{error.message || "Something went wrong."}</p>
                  {!capReached && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => regenerate()}>
                      Retry
                    </Button>
                  )}
                </div>
              )}
              <div ref={bottom} />
            </div>
          </div>
          <div className="pt-2 pb-1">{composer}</div>
        </>
      )}

      {execUsage && (
        <div className="flex h-8 shrink-0 items-center justify-end">
          <UsageRing used={execUsage.used} cap={execUsage.cap} />
        </div>
      )}
    </div>
  );
}

function Avatar180() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo-icon.png" alt="" aria-hidden className="mt-0.5 size-7 shrink-0 object-contain" />
  );
}
