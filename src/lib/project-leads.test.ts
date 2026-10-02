import { describe, expect, it } from "vitest";
import { planLeadChange } from "./project-leads";

describe("planLeadChange", () => {
  it("does nothing when the pick matches the current primary", () => {
    expect(planLeadChange("mahika", "mahika")).toBeNull();
  });

  it("treats null, undefined and empty as the same 'no lead'", () => {
    expect(planLeadChange(null, null)).toBeNull();
    expect(planLeadChange(undefined, null)).toBeNull();
    expect(planLeadChange(null, "")).toBeNull();
  });

  it("swaps only the old primary for the new pick", () => {
    expect(planLeadChange("mahika", "saumya")).toEqual({ demote: "mahika", promote: "saumya" });
  });

  it("promotes without demoting when there was no lead", () => {
    expect(planLeadChange(null, "saumya")).toEqual({ demote: null, promote: "saumya" });
  });

  it("demotes without promoting when the lead is cleared", () => {
    expect(planLeadChange("mahika", null)).toEqual({ demote: "mahika", promote: null });
  });
});
