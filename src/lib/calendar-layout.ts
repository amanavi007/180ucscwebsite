/** Minutes after midnight for the start and (optionally) end of an event's free-form time text. */
export interface ParsedTime {
  start: number;
  end: number | null;
}

const CLOCK = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/gi;

function toMinutes(hourText: string, minuteText: string | undefined, meridiem: string | undefined, fallback?: string): number | null {
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (Number.isNaN(hour) || minute > 59) return null;
  const m = (meridiem ?? fallback)?.toLowerCase().replace(/\./g, "");
  if (m === "pm" && hour < 12) hour += 12;
  if (m === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return hour * 60 + minute;
}

/**
 * Reads times people actually type: "7pm", "7:00 PM", "19:00", "6:30-8 pm". Returns null when there is no clock
 * time in the text, which the calendar treats as an all-day item.
 */
export function parseEventTime(text: string | null | undefined): ParsedTime | null {
  if (!text) return null;
  const matches = [...text.matchAll(CLOCK)].filter((m) => m[2] !== undefined || m[3] !== undefined || Number(m[1]) >= 13);
  if (matches.length === 0) return null;
  const [first, second] = matches;
  // "6:30-8 pm": the first time borrows the second one's am/pm when it has none.
  const start = toMinutes(first[1], first[2], first[3], second?.[3]);
  if (start === null) return null;
  const end = second ? toMinutes(second[1], second[2], second[3], first[3]) : null;
  return { start, end: end !== null && end > start ? end : null };
}

export interface PlacedEvent<T> {
  item: T;
  start: number;
  end: number;
  /** Which side-by-side column this event sits in, and how many columns its overlapping group has. */
  column: number;
  columns: number;
}

/** Lays one day's timed events out so overlapping ones sit side by side. Events without an end last `defaultMinutes`. */
export function layoutDay<T>(items: { item: T; time: ParsedTime }[], defaultMinutes = 60): PlacedEvent<T>[] {
  const events = items
    .map(({ item, time }) => ({ item, start: time.start, end: time.end ?? time.start + defaultMinutes }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const placed: PlacedEvent<T>[] = [];
  let group: PlacedEvent<T>[] = [];
  let groupEnd = -1;

  const closeGroup = () => {
    const columns = Math.max(1, ...group.map((g) => g.column + 1));
    for (const g of group) g.columns = columns;
    placed.push(...group);
    group = [];
  };

  for (const e of events) {
    if (group.length > 0 && e.start >= groupEnd) closeGroup();
    // First column in this group whose last event has already ended.
    const column = (() => {
      for (let c = 0; ; c++) {
        const inColumn = group.filter((g) => g.column === c);
        if (inColumn.every((g) => g.end <= e.start)) return c;
      }
    })();
    group.push({ ...e, column, columns: 1 });
    groupEnd = Math.max(groupEnd, e.end);
  }
  if (group.length > 0) closeGroup();
  return placed;
}
