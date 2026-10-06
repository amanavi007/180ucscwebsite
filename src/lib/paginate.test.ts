import { describe, expect, it } from "vitest";
import { fetchAllPages } from "./paginate";

function fakeTable(total: number) {
  const calls: [number, number][] = [];
  const rows = Array.from({ length: total }, (_, i) => i);
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  };
  return { page, calls };
}

describe("fetchAllPages", () => {
  it("reads past the 1000-row API cap by paging until a short page", async () => {
    const { page, calls } = fakeTable(2500);
    const all = await fetchAllPages(page);
    expect(all).toHaveLength(2500);
    expect(all[2499]).toBe(2499);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops after one page when the table is small, and handles an empty table", async () => {
    const small = fakeTable(3);
    expect(await fetchAllPages(small.page)).toEqual([0, 1, 2]);
    expect(small.calls).toHaveLength(1);
    expect(await fetchAllPages(fakeTable(0).page)).toEqual([]);
  });

  it("makes one extra empty request when the row count is an exact multiple of the page size", async () => {
    const { page, calls } = fakeTable(1000);
    expect(await fetchAllPages(page)).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it("throws the query error", async () => {
    await expect(fetchAllPages(async () => ({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});
