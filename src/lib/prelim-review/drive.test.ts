import { describe, expect, it } from "vitest";
import { kindForMime, metadataUrl, slideTexts } from "./drive";

describe("kindForMime", () => {
  it("maps google docs and slides only", () => {
    expect(kindForMime("application/vnd.google-apps.document")).toBe("doc");
    expect(kindForMime("application/vnd.google-apps.presentation")).toBe("slides");
    expect(kindForMime("application/pdf")).toBeNull();
  });
});

describe("slideTexts", () => {
  it("joins every text run per slide, in order", () => {
    const pres = {
      slides: [
        { pageElements: [{ shape: { text: { textElements: [{ textRun: { content: "Hello " } }, { textRun: { content: "world\n" } }] } } }] },
        { pageElements: [{ shape: {} }, { shape: { text: { textElements: [{ textRun: { content: "Source: X" } }] } } }] },
        {},
      ],
    };
    expect(slideTexts(pres)).toEqual(["Hello world", "Source: X", ""]);
  });
});

describe("metadataUrl", () => {
  it("asks for shared-drive files too, or Drive answers 404 for them", () => {
    const url = metadataUrl("abc 123");
    expect(url).toContain("/files/abc%20123?");
    expect(url).toContain("supportsAllDrives=true");
  });
});
