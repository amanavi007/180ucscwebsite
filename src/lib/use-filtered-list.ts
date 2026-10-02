import { useMemo, useState } from "react";

/**
 * Simple case-insensitive substring filter over an in-memory array. No fuzzy
 * matching, no external dependency -- just a text filter for lists that are
 * currently un-searchable. `searchFields` picks which string field(s) of each
 * item to match against; a field can be a key or a small accessor for
 * derived/nested values (e.g. `(p) => p.profile?.name`).
 */
export type SearchField<T> = keyof T | ((item: T) => string | null | undefined);

function fieldValue<T>(item: T, field: SearchField<T>): string {
  const value = typeof field === "function" ? field(item) : item[field];
  return value == null ? "" : String(value);
}

export function useFilteredList<T>(items: T[], searchFields: SearchField<T>[]) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      searchFields.some((field) => fieldValue(item, field).toLowerCase().includes(q)),
    );
  }, [items, searchFields, query]);

  return { query, setQuery, filtered };
}
