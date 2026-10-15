import { expect, it } from "vitest";
import { resourceViews } from "./resource-views";

it("lists the three Resources views and marks exactly one active", () => {
  const items = resourceViews("prelim");
  expect(items.map((i) => i.label)).toEqual(["Wiki", "Quick links", "Prelim review"]);
  expect(items.map((i) => i.href)).toEqual(["/portal/resources", "/portal/quick-links", "/portal/prelim-review"]);
  expect(items.filter((i) => i.active).map((i) => i.label)).toEqual(["Prelim review"]);
});
