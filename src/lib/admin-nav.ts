export interface AdminNavItem {
  href: string;
  label: string;
  group?: string;
  quarterScoped?: boolean;
}

export const ADMIN_HUB_HREF = "/portal/admin";

/** Display order matters: the hub's area cards render in this order. */
export const ADMIN_AREA_LABELS: Record<string, string> = {
  "admin-people": "People",
  "admin-quarter-setup": "Quarter setup",
  "admin-recruitment": "Recruitment",
  "admin-system": "System",
};

export interface AdminLocation<T extends AdminNavItem> {
  areaKey: string;
  areaLabel: string;
  page: T;
  siblings: T[];
}

export function getAdminLocation<T extends AdminNavItem>(pathname: string, links: T[]): AdminLocation<T> | null {
  const page = links.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`));
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
