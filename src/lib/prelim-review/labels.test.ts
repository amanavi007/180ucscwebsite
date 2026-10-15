import { expect, it } from "vitest";
import { STATUS_CHIP, VERDICT_CHIP } from "./labels";

it("every status is a word, never color alone", () => {
  expect(STATUS_CHIP.pass).toEqual({ label: "Passes", variant: "ok" });
  expect(STATUS_CHIP.fix).toEqual({ label: "Needs work", variant: "warn" });
  expect(STATUS_CHIP.missing).toEqual({ label: "Missing", variant: "bad" });
  expect(VERDICT_CHIP.ready.label).toBe("Ready for prelim check");
  expect(VERDICT_CHIP.needs_work.label).toBe("Needs work");
});
