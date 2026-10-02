import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared fallback for every route under portal/(app) -- shown the instant a
 * navigation starts, while that page's own data is still being fetched.
 * Deliberately generic (title + a few content blocks) since it covers every
 * tab: dashboard, directory, tasks, admin, etc.
 */
export default function AppLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
