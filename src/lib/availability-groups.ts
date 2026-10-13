import type { AvailabilityRowInput, TimeBlockInput } from "./coffee-chat";

/** A stable key for one availability block, ignoring seconds, so the same block is recognised however it was saved. */
export function availabilityKey(r: { date: string; startTime: string; endTime: string }): string {
  return `${r.date}|${r.startTime.slice(0, 5)}|${r.endTime.slice(0, 5)}`;
}

/** Groups rows so every date that has the same time blocks goes in one request. */
export function groupByBlocks(rows: AvailabilityRowInput[]): { dates: string[]; blocks: TimeBlockInput[] }[] {
  const byDate = new Map<string, TimeBlockInput[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), { startTime: r.startTime, endTime: r.endTime }]);
  const groups = new Map<string, { dates: string[]; blocks: TimeBlockInput[] }>();
  for (const [date, blocks] of byDate) {
    const signature = JSON.stringify(blocks);
    const group = groups.get(signature) ?? { dates: [], blocks };
    group.dates.push(date);
    groups.set(signature, group);
  }
  return [...groups.values()];
}
