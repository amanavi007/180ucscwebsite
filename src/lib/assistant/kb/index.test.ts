import { describe, expect, it } from "vitest";
import { KB_CHUNKS } from "./index";

const FIELDS = ["id", "title", "section", "source_title", "source_url", "updated", "text"] as const;

describe("KB_CHUNKS", () => {
  it("has the compiled chunks", () => {
    expect(KB_CHUNKS.length).toBeGreaterThanOrEqual(84);
  });
  it("has unique ids", () => {
    expect(new Set(KB_CHUNKS.map((c) => c.id)).size).toBe(KB_CHUNKS.length);
  });
  it("has the required string fields, with non-empty id, title, section and text", () => {
    for (const c of KB_CHUNKS) {
      for (const f of FIELDS) expect(typeof c[f], `${c.id}.${f}`).toBe("string");
      for (const f of ["id", "title", "section", "text"] as const) expect(c[f].trim().length, `${c.id}.${f}`).toBeGreaterThan(0);
    }
  });
  it("keeps every chunk a sane size (it is searched and excerpted whole)", () => {
    for (const c of KB_CHUNKS) expect(c.text.length, c.id).toBeLessThan(8000);
  });
});
