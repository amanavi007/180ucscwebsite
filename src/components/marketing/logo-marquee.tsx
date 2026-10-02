import Image from "next/image";
import { cn } from "@/lib/utils";

type Logo = { name: string; src: string };

const SIZE_VARIANTS = ["h-9", "h-14", "h-11", "h-16", "h-10"];
const OFFSET_VARIANTS = ["translate-y-0", "translate-y-3", "-translate-y-2", "translate-y-1", "-translate-y-3"];

// Repeating the list only twice leaves a blank gap right before the loop
// resets whenever one copy is narrower than the viewport (true for our
// shorter rows on wide screens). Repeating it more times, and moving by
// exactly one copy-width (-100/REPEAT%) each cycle, keeps a full viewport
// of logos queued up at all times regardless of row length or screen size.
const REPEAT = 4;

export function LogoMarquee({
  logos,
  duration = 110,
  reverse = false,
  grayscale = false,
}: {
  logos: Logo[];
  duration?: number;
  reverse?: boolean;
  grayscale?: boolean;
}) {
  const track = Array.from({ length: REPEAT }, () => logos).flat();

  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)] motion-reduce:overflow-x-auto motion-reduce:[mask-image:none]">
      <div
        className={cn(
          "animate-marquee flex w-max items-center gap-12 py-3 sm:gap-20",
          reverse && "[animation-direction:reverse]",
        )}
        style={{
          animationDuration: `${duration}s`,
          ["--marquee-distance" as string]: `-${100 / REPEAT}%`,
        }}
      >
        {track.map((logo, i) => (
          <div
            key={`${logo.name}-${i}`}
            className={cn(
              "flex shrink-0 items-center justify-center",
              SIZE_VARIANTS[i % SIZE_VARIANTS.length],
              OFFSET_VARIANTS[i % OFFSET_VARIANTS.length],
            )}
          >
            <Image
              src={logo.src}
              alt={logo.name}
              width={220}
              height={90}
              loading="eager"
              className={cn(
                "h-full w-auto max-w-[9rem] object-contain sm:max-w-[13rem]",
                grayscale && "opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0",
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
