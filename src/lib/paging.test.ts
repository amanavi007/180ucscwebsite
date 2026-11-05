import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, pageRows, parsePage, parsePageSize } from "./paging";

describe("paging", () => {
  it("offers 50, 100 and 250 and defaults to 50", () => {
    expect(PAGE_SIZES).toEqual([50, 100, 250]);
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect(parsePageSize("100")).toBe(100);
    expect(parsePageSize("7")).toBe(50);
    expect(parsePageSize(null)).toBe(50);
  });
  it("clamps the page to the pages that exist", () => {
    expect(parsePage("3", 120, 50)).toBe(3);
    expect(parsePage("99", 120, 50)).toBe(3);
    expect(parsePage("0", 120, 50)).toBe(1);
    expect(parsePage("x", 0, 50)).toBe(1);
  });
  it("returns only one page of rows", () => {
    const rows = Array.from({ length: 120 }, (_, i) => i);
    expect(pageRows(rows, 1, 50)).toHaveLength(50);
    expect(pageRows(rows, 3, 50)).toEqual(rows.slice(100));
  });
});

/**
 * Guard: a list that can hold hundreds of rows must page. Every portal file that draws a table body from a list
 * either uses the shared Pager or is on this short list of lists that cannot get long.
 */
describe("long lists page", () => {
  const SHORT_LISTS = ["today-view.tsx", "schedule-days.tsx"];
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  it("every outreach list table uses the Pager", () => {
    const files = walk("src/app/portal/(app)/admin/outreach").filter((f) => f.endsWith(".tsx") && !SHORT_LISTS.some((s) => f.endsWith(s)));
    const tables = files.filter((f) => /<TableBody>[\s\S]*\.map\(/.test(readFileSync(f, "utf8")));
    expect(tables.length).toBeGreaterThan(0);
    for (const f of tables) expect(readFileSync(f, "utf8"), `${f} draws a table without a Pager`).toMatch(/<Pager\b/);
  });
});
