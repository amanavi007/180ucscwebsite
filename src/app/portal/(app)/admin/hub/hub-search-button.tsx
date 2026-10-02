"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HubSearchButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-w-52 justify-between text-muted-foreground"
      onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
    >
      <span className="flex items-center gap-2">
        <Search className="size-3.5" />
        Jump to or search…
      </span>
      <kbd className="rounded border px-1 text-[10px]">⌘K</kbd>
    </Button>
  );
}
