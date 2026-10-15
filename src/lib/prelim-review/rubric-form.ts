import { criteriaSchema, type Criterion } from "./rubric";

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "criterion";
}

export function criteriaToText(criteria: Criterion[]): string {
  return criteria.map((c) => `${c.title} | ${c.id}\n${c.description}`).join("\n\n");
}

export function parseCriteriaText(text: string): { ok: true; criteria: Criterion[] } | { ok: false; error: string } {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return { ok: false, error: "Add at least one criterion." };
  const used = new Set<string>();
  const criteria: Criterion[] = [];
  for (const block of blocks) {
    const [head, ...rest] = block.split("\n");
    const [titleRaw, idRaw] = head.split("|").map((s) => s.trim());
    const description = rest.join(" ").trim();
    if (!titleRaw) return { ok: false, error: "Each criterion needs a title on its first line." };
    if (!description) return { ok: false, error: `Describe what a pass looks like for "${titleRaw}".` };
    let id = idRaw || slug(titleRaw);
    if (!idRaw) {
      const base = id;
      for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    }
    used.add(id);
    criteria.push({ id, title: titleRaw, description });
  }
  const checked = criteriaSchema.safeParse(criteria);
  return checked.success ? { ok: true, criteria: checked.data } : { ok: false, error: checked.error.issues[0].message };
}
