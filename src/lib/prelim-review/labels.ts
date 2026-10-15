import type { ReviewStatus } from "./rubric";

type Variant = "ok" | "warn" | "bad" | "info" | "muted";

export const STATUS_CHIP: Record<ReviewStatus, { label: string; variant: Variant }> = {
  pass: { label: "Passes", variant: "ok" },
  fix: { label: "Needs work", variant: "warn" },
  missing: { label: "Missing", variant: "bad" },
};

export const VERDICT_CHIP: Record<"ready" | "needs_work", { label: string; variant: Variant }> = {
  ready: { label: "Ready for prelim check", variant: "ok" },
  needs_work: { label: "Needs work", variant: "warn" },
};

export const RUN_CHIP: Record<"running" | "error", { label: string; variant: Variant }> = {
  running: { label: "Reviewing", variant: "info" },
  error: { label: "Could not review", variant: "bad" },
};
