export interface AdminNavItem {
  href: string;
  label: string;
  group?: string;
  quarterScoped?: boolean;
}

export const ADMIN_HUB_HREF = "/portal/admin";

/** Display order matters: the hub's area cards render in this order. */
export const ADMIN_AREA_LABELS: Record<string, string> = {
  "admin-today": "Today",
  "admin-recruiting": "Recruiting",
  "admin-scheduling": "Scheduling",
  "admin-outreach": "Outreach",
  "admin-people": "People",
  "admin-setup": "Setup",
};

export interface AdminLocation<T extends AdminNavItem> {
  areaKey: string;
  areaLabel: string;
  page: T;
  siblings: T[];
}

export function getAdminLocation<T extends AdminNavItem>(pathname: string, links: T[]): AdminLocation<T> | null {
  // The hub only matches exactly, otherwise it would match every admin path.
  const page = links.find((l) => pathname === l.href || (l.href !== ADMIN_HUB_HREF && pathname.startsWith(`${l.href}/`)));
  if (!page || !page.group) return null;
  return {
    areaKey: page.group,
    areaLabel: ADMIN_AREA_LABELS[page.group] ?? page.group,
    page,
    siblings: links.filter((l) => l.group === page.group),
  };
}

export function withQuarterParam(href: string, quarterId: string | null | undefined): string {
  if (!quarterId) return href;
  return `${href}${href.includes("?") ? "&" : "?"}quarter=${encodeURIComponent(quarterId)}`;
}

/** The quarter every admin page defaults to: the active one, else the first. Null when there are none. */
export function defaultQuarterId(quarters: { id: string; is_active: boolean }[]): string | null {
  return (quarters.find((q) => q.is_active) ?? quarters[0])?.id ?? null;
}

export function resolveQuarterId(
  param: string | null | undefined,
  quarters: { id: string }[],
  fallbackId: string | null,
): string | null {
  if (param && quarters.some((q) => q.id === param)) return param;
  return fallbackId;
}

export type MembersAction = "bulk-add" | "find";

export function parseMembersAction(value: string | string[] | null | undefined): MembersAction | null {
  return value === "bulk-add" || value === "find" ? value : null;
}
