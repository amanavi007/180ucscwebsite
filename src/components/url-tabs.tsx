"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

/** Reads the active tab from the URL and writes it back with replaceState, so a reload (or shared link) lands on the same tab without refetching the server page. */
export function useUrlTab(values: readonly string[], fallback: string, param = "tab") {
  const searchParams = useSearchParams();
  const raw = searchParams.get(param);
  const tab = raw && values.includes(raw) ? raw : fallback;

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(window.location.search);
      if (next === fallback) params.delete(param);
      else params.set(param, next);
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    },
    [fallback, param],
  );

  return [tab, setTab] as const;
}

export function UrlTabs({
  values,
  fallback,
  param = "tab",
  ...props
}: Omit<React.ComponentProps<typeof Tabs>, "value" | "defaultValue" | "onValueChange"> & {
  values: readonly string[];
  fallback: string;
  param?: string;
}) {
  const [tab, setTab] = useUrlTab(values, fallback, param);
  return <Tabs {...props} value={tab} onValueChange={(v) => v && setTab(String(v))} />;
}
