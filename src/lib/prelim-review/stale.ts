const STALE_AFTER_MS = 5 * 60 * 1000;

/** A review the server never finished (function timeout) would read "Reviewing" forever; show it as failed instead. */
export function effectiveStatus(
  row: { status: "running" | "done" | "error"; createdAt: string },
  now: Date,
): { status: "running" | "done" | "error"; errorMessage: string | null } {
  if (row.status === "running" && now.getTime() - new Date(row.createdAt).getTime() > STALE_AFTER_MS) {
    return { status: "error", errorMessage: "The review took too long and was stopped. Please run it again." };
  }
  return { status: row.status, errorMessage: null };
}
