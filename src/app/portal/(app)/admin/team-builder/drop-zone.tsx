"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export function DropZone({
  id,
  children,
  className,
  placeholder,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  placeholder?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-10 flex-col gap-1.5 rounded-md p-1 transition-colors",
        isOver && "bg-primary/5 ring-2 ring-primary/30",
        className,
      )}
    >
      {children}
      {placeholder && (
        <div className="col-span-full flex h-9 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          {placeholder}
        </div>
      )}
    </div>
  );
}
