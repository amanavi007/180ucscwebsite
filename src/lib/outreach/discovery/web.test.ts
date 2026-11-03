import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPageHtml, fetchRobotsTxt, loadYcDataset } from "./web";

const respond = (body: string, init: { status?: number; type?: string } = {}) =>
  new Response(body, { status: init.status ?? 200, headers: { "content-type": init.type ?? "text/html; charset=utf-8" } });

afterEach(() => vi.unstubAllGlobals());

describe("fetchPageHtml", () => {
  it("returns the html and identifies itself", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond("<p>hi</p>"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchPageHtml("https://acme.com/")).toBe("<p>hi</p>");
    expect(fetchMock.mock.calls[0][1].headers["user-agent"]).toMatch(/research-bot/);
  });
  it("returns null for errors, non-html, and network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond("nope", { status: 404 })));
    expect(await fetchPageHtml("https://acme.com/x")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond("{}", { type: "application/json" })));
    expect(await fetchPageHtml("https://acme.com/api")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("dns")));
    expect(await fetchPageHtml("https://acme.com/")).toBeNull();
  });
  it("only reads the first part of a very large page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond("x".repeat(900_000))));
    expect((await fetchPageHtml("https://acme.com/"))!.length).toBeLessThanOrEqual(400_000);
  });
});

describe("fetchRobotsTxt", () => {
  it("returns the text, or empty when there is none or it cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond("User-agent: *\nDisallow: /a", { type: "text/plain" })));
    expect(await fetchRobotsTxt("https://acme.com")).toContain("Disallow: /a");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond("", { status: 404 })));
    expect(await fetchRobotsTxt("https://acme.com")).toBe("");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("x")));
    expect(await fetchRobotsTxt("https://acme.com")).toBe("");
  });
});

describe("loadYcDataset", () => {
  it("returns the companies, and throws when the dataset is not a list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(JSON.stringify([{ name: "A" }]), { type: "application/json" })));
    expect(await loadYcDataset()).toEqual([{ name: "A" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond("{}", { type: "application/json" })));
    await expect(loadYcDataset()).rejects.toThrow(/dataset/i);
  });
});
