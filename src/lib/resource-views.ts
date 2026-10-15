export type ResourceView = "wiki" | "links" | "prelim";

/** The view switch shared by every page under Resources. */
export function resourceViews(active: ResourceView) {
  return [
    { href: "/portal/resources", label: "Wiki", active: active === "wiki" },
    { href: "/portal/quick-links", label: "Quick links", active: active === "links" },
    { href: "/portal/prelim-review", label: "Prelim review", active: active === "prelim" },
  ];
}
