import { describe, expect, it } from "vitest";
import { isAllowedByRobots, metaDescription, pageUrlsToTry } from "./page";

describe("isAllowedByRobots", () => {
  it("allows everything when there is no robots.txt", () => {
    expect(isAllowedByRobots("", "/contact")).toBe(true);
  });
  it("blocks a path disallowed for all agents", () => {
    expect(isAllowedByRobots("User-agent: *\nDisallow: /contact", "/contact")).toBe(false);
    expect(isAllowedByRobots("User-agent: *\nDisallow: /contact", "/about")).toBe(true);
  });
  it("blocks everything for Disallow: /", () => {
    expect(isAllowedByRobots("User-agent: *\nDisallow: /", "/")).toBe(false);
  });
  it("lets a longer Allow override a Disallow", () => {
    expect(isAllowedByRobots("User-agent: *\nDisallow: /team\nAllow: /team/public", "/team/public")).toBe(true);
  });
  it("ignores rules for other agents and treats an empty Disallow as allow-all", () => {
    expect(isAllowedByRobots("User-agent: Googlebot\nDisallow: /", "/")).toBe(true);
    expect(isAllowedByRobots("User-agent: *\nDisallow:", "/")).toBe(true);
  });
  it("honours rules that name this bot", () => {
    expect(isAllowedByRobots("User-agent: 180dcucsc-research-bot\nDisallow: /", "/")).toBe(false);
  });
});

describe("metaDescription", () => {
  it("reads the description or og:description", () => {
    expect(metaDescription('<meta name="description" content="We build scheduling for clinics.">')).toBe("We build scheduling for clinics.");
    expect(metaDescription('<meta property="og:description" content="Fast &amp; simple scheduling for busy clinics.">')).toBe("Fast & simple scheduling for busy clinics.");
    expect(metaDescription('<meta content="Attribute order reversed here." name="description">')).toBe("Attribute order reversed here.");
  });
  it("returns null when there is none, or it is too short to be a fact", () => {
    expect(metaDescription("<p>hi</p>")).toBeNull();
    expect(metaDescription('<meta name="description" content="Home">')).toBeNull();
  });
});

describe("pageUrlsToTry", () => {
  it("starts with the home page and adds the usual contact pages", () => {
    const urls = pageUrlsToTry("https://acme.com/");
    expect(urls[0]).toBe("https://acme.com/");
    expect(urls).toContain("https://acme.com/contact");
    expect(urls).toContain("https://acme.com/about");
    expect(urls).toContain("https://acme.com/team");
    expect(urls.length).toBeLessThanOrEqual(6);
  });
});
