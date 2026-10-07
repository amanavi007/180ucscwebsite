"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send, Square, SquarePen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MarkdownContent } from "@/components/markdown-content";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ProposalCard } from "./proposal-card";

const MAX_CHARS = 2000;
const SUGGESTIONS = ["What's due?", "Upcoming events", "Which projects am I on?"];

class ThreadHolder {
  constructor(public id: string | null) {}
  set(id: string | null) {
    this.id = id;
  }
}

type ProposalOutput = { status?: string; proposalId?: string; preview?: string };

export function ChatPanel({
  initialThreadId,
  initialMessages,
}: {
  initialThreadId: string | null;
  initialMessages: UIMessage[];
}) {
  // Mutable holder (not a ref) so the transport closures below stay lint-clean.
  const [thread] = useState(() => new ThreadHolder(initialThreadId));
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ threadId: thread.id }),
        fetch: async (url, init) => {
          const res = await fetch(url, init);
          const id = res.headers.get("x-thread-id");
          if (id) thread.set(id);
          return res;
        },
      }),
  );

  const { messages, setMessages, sendMessage, status, error, regenerate, stop } = useChat({
    messages: initialMessages,
    transport,
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";
  const tooLong = input.length > MAX_CHARS;
  const capReached = !!error && /limit|midnight/i.test(error.message);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <p className="text-sm font-medium">Assistant</p>
        <Button size="sm" variant="ghost" onClick={newChat} disabled={busy || messages.length === 0}>
          <SquarePen className="mr-1.5 size-4" /> New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md space-y-3 pt-10 text-center">
            <p className="text-lg font-semibold">What can I help with?</p>
            <p className="text-sm text-muted-foreground">
              Ask about your projects, tasks and events. For changes, I&apos;ll propose them and you approve.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} size="sm" variant="outline" onClick={() => submit(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return m.role === "user" ? (
                    <p key={i} className="whitespace-pre-wrap text-sm">{part.text}</p>
                  ) : (
                    <MarkdownContent key={i} body={part.text} />
                  );
                }
                if (part.type === "tool-propose_exec_todo" && part.state === "output-available") {
                  const out = part.output as ProposalOutput;
                  if (out.status === "awaiting_user_approval" && out.proposalId && out.preview) {
                    return <ProposalCard key={i} proposalId={out.proposalId} preview={out.preview} />;
                  }
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {status === "submitted" && <p className="text-sm text-muted-foreground">Thinking...</p>}
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

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            placeholder="Ask anything..."
            rows={1}
            className="max-h-40 min-h-10 resize-none"
          />
          {busy ? (
            <Button type="button" size="icon" variant="outline" onClick={() => stop()} aria-label="Stop">
              <Square className="size-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim() || tooLong} aria-label="Send">
              <Send className="size-4" />
            </Button>
          )}
        </div>
        {input.length > MAX_CHARS * 0.8 && (
          <p className={cn("mt-1 text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}>
            {input.length}/{MAX_CHARS}
          </p>
        )}
      </form>
    </div>
  );
}
