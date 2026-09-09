import Image from "next/image";

export function LoadingCurtain() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-background fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 overflow-hidden"
    >
      <div className="relative h-20 w-full shrink-0">
        <span className="loading-curtain-glow size-24" />
        <Image
          src="/logo-icon.png"
          alt=""
          width={987}
          height={1006}
          priority
          className="loading-curtain-ball size-16"
        />
      </div>
      <Image
        src="/logo-stacked-text-dark.png"
        alt="180 Degrees Consulting, UC Santa Cruz"
        width={981}
        height={375}
        className="loading-curtain-wordmark h-11 w-auto dark:hidden"
      />
      <Image
        src="/logo-stacked-text-light.png"
        alt="180 Degrees Consulting, UC Santa Cruz"
        width={981}
        height={375}
        className="loading-curtain-wordmark hidden h-11 w-auto dark:block"
      />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
