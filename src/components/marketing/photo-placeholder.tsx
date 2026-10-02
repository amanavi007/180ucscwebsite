import Image from "next/image";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

export function PhotoPlaceholder({
  label,
  shape = "square",
  iconOnly = false,
  className,
  src,
}: {
  label: string;
  shape?: "square" | "circle";
  iconOnly?: boolean;
  className?: string;
  src?: string;
}) {
  if (src) {
    return (
      <div
        className={cn(
          "relative overflow-hidden bg-muted",
          shape === "circle" ? "rounded-full" : "rounded-2xl",
          className,
        )}
      >
        <Image
          src={src}
          alt={label}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      title={label}
      className={cn(
        "photo-placeholder",
        shape === "circle" ? "rounded-full" : "rounded-2xl",
        className,
      )}
    >
      {iconOnly ? (
        <>
          <Camera className="size-6 shrink-0" aria-hidden />
          <span className="sr-only">{label}</span>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 text-center">
          <Camera className="size-6 shrink-0" aria-hidden />
          <p className="text-xs font-medium text-balance">{label}</p>
        </div>
      )}
    </div>
  );
}
