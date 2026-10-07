type Rec = Record<string, unknown>;

const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/[\n|]+/g, " "));

/**
 * What the model sees of a tool result. The page still gets the full structured result to draw
 * cards; the model only needs the facts, so column names are written once instead of per row.
 */
export function compactForModel(result: unknown): string {
  const r = (result ?? {}) as Rec;
  if (Array.isArray(r.items)) {
    const items = r.items as Rec[];
    if (items.length === 0) return typeof r.note === "string" ? r.note : "No results.";
    const cols = Object.keys(items[0]);
    const head = r.truncated ? `showing ${items.length} of ${r.total}` : `${r.total} results`;
    const rows = items.map((item) => cols.map((c) => cell(item[c])).join("|"));
    const note = typeof r.note === "string" ? [`note: ${r.note}`] : [];
    return [head, cols.join("|"), ...rows, ...note].join("\n");
  }
  return Object.entries(r)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${cell(v)}`)
    .join(" ");
}
