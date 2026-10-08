import { resolveByName, uniqueBy, type Resolved } from "./resolve";
import type { DirectoryEntry, QuarterProjectRow, ToolDeps } from "./types";

/** A lookup either found exactly one record or produced a message the model can relay to the user. */
export type Lookup<T> = { ok: true; item: T } | { ok: false; reason: string };

const NO_QUARTER = "There is no active quarter yet.";

function toLookup<T>(r: Resolved<T>, label: string, nameOf: (t: T) => string, query: string): Lookup<T> {
  if (r.kind === "one") return { ok: true, item: r.item };
  if (r.kind === "none") return { ok: false, reason: `No ${label} matches "${query}".` };
  const names = r.items.slice(0, 6).map(nameOf).join("; ");
  return { ok: false, reason: `More than one ${label} matches "${query}" (${names}). Ask the user which one.` };
}

export async function findProject(deps: ToolDeps, query: string): Promise<Lookup<QuarterProjectRow>> {
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return { ok: false, reason: NO_QUARTER };
  const rows = await deps.data.quarterProjects(quarter.id);
  return toLookup(resolveByName(query, rows, (p) => p.client_name), "project", (p) => p.client_name, query);
}

export async function findPerson(deps: ToolDeps, query: string): Promise<Lookup<DirectoryEntry>> {
  const quarter = await deps.data.activeQuarter();
  if (!quarter) return { ok: false, reason: NO_QUARTER };
  const rows = uniqueBy(await deps.data.directory(quarter.id), (p) => p.id);
  return toLookup(resolveByName(query, rows, (p) => p.name), "person", (p) => p.name, query);
}
