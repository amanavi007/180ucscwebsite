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
