const SIZE = 40;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

function tone(fraction: number): string {
  if (fraction >= 0.66) return "stroke-emerald-600";
  if (fraction >= 0.33) return "stroke-amber-500";
  return "stroke-slate-400";
}

export function ScoreRing({ value, fraction }: { value: number; fraction: number }) {
  return (
    <div className="relative size-10 shrink-0" aria-label={`${value} points`}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} className="stroke-muted" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - fraction)}
          className={tone(fraction)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}
