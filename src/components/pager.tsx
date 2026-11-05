"use client";

import { FilterChip } from "@/components/filter-chip";
import { Button } from "@/components/ui/button";
import { PAGE_SIZES } from "@/lib/paging";

/**
 * The bar under every long list: which rows are showing, how many per page, and Previous / Next.
 * `page` and `size` come from the address bar; `onChange` writes them back. Use it on any list that can pass 50 rows.
 */
export function Pager({
  total,
  page,
  size,
  noun = "companies",
  pending = false,
  onChange,
}: {
  total: number;
  page: number;
  size: number;
  noun?: string;
  pending?: boolean;
  onChange: (changes: { page?: number; size?: number }) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / size));
  const first = total === 0 ? 0 : (page - 1) * size + 1;
  const last = Math.min(total, page * size);
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">{total === 0 ? `No ${noun}` : `${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()}`}</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-1.5" role="group" aria-label={`${noun} per page`}>
          <span className="text-sm text-muted-foreground">Per page</span>
          {PAGE_SIZES.map((n) => (
            <FilterChip key={n} selected={size === n} onClick={() => onChange({ size: n })}>
              {n}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending || page <= 1} onClick={() => onChange({ page: page - 1 })}>
            Previous
          </Button>
          <span className="text-sm tabular-nums">
            Page {page} of {lastPage}
          </span>
          <Button variant="outline" size="sm" disabled={pending || page >= lastPage} onClick={() => onChange({ page: page + 1 })}>
            Next
          </Button>
        </div>
      </div>
    </nav>
  );
}
