"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Execs legitimately need to read this off to a new member, so hide it behind
 * a reveal toggle rather than exposing it in plain text everywhere it shows up.
 */
export function MaskedSecret({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <code>{visible ? value : "•".repeat(value.length || 8)}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </Button>
    </span>
  );
}
