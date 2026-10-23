const PAGE_SIZE = 1000;

/**
 * Reads every row of a query. Hosted Supabase (PostgREST) returns at most
 * 1000 rows per request, so a whole-table read silently truncates once the
 * table grows. `page(from, to)` runs the query with `.range(from, to)`.
 */
export async function fetchAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: Error | { message: string } | null;
  }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error instanceof Error ? error : new Error(error.message);
    all.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return all;
  }
}

/**
 * How many ids go into one `.in()` filter. The list travels in the request URL, which PostgREST rejects with
 * "Bad Request" once it gets too long (roughly a few hundred uuids), so any id list that grows with the data
 * must be split with `chunkIds` / `fetchInChunks` / `runInChunks` instead of passed to `.in()` whole.
 */
export const ID_CHUNK = 100;

export function chunkIds<T>(ids: readonly T[], size = ID_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

/** Reads every matching row for a long id list: one paged query per chunk of ids. `page` should filter with `.in(col, chunk)`. */
export async function fetchInChunks<T, I = string>(
  ids: readonly I[],
  page: (
    chunk: I[],
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: Error | { message: string } | null;
  }>,
): Promise<T[]> {
  const all: T[] = [];
  for (const chunk of chunkIds([...new Set(ids)])) {
    all.push(...(await fetchAllPages((from, to) => page(chunk, from, to))));
  }
  return all;
}

/** Runs an update or delete over a long id list, one chunk at a time; returns the first error, or null. */
export async function runInChunks<I = string>(
  ids: readonly I[],
  run: (chunk: I[]) => PromiseLike<{ error: { message: string } | null }>,
): Promise<{ message: string } | null> {
  for (const chunk of chunkIds([...new Set(ids)])) {
    const { error } = await run(chunk);
    if (error) return error;
  }
  return null;
}
