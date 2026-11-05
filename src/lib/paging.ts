/** Page sizes every long list offers. A list that can pass 50 rows pages; nothing renders hundreds of rows at once. */
export const PAGE_SIZES = [50, 100, 250];
export const DEFAULT_PAGE_SIZE = 50;

/** A page size from the address bar, falling back to the default for anything else. */
export function parsePageSize(value: string | null | undefined): number {
  const n = Number(value);
  return PAGE_SIZES.includes(n) ? n : DEFAULT_PAGE_SIZE;
}

/** A 1-based page number from the address bar, clamped to the pages that exist. */
export function parsePage(value: string | null | undefined, total: number, size: number): number {
  const last = Math.max(1, Math.ceil(total / size));
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, last) : 1;
}

/** The rows on one page of a list held in the browser. */
export function pageRows<T>(rows: T[], page: number, size: number): T[] {
  return rows.slice((page - 1) * size, page * size);
}
