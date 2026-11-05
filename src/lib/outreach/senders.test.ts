import { describe, expect, it } from "vitest";
import { buildSignature, cleanLinkedin, parseSenders, pickSender, sendersFromRoster, sendersProblem, type OutreachSender } from "./senders";

const officer = (name: string, over: Partial<OutreachSender> = {}): OutreachSender => ({
  id: name.toLowerCase().replace(/\W/g, ""),
  name,
  title: "Director of Projects",
  linkedin: "",
  enabled: true,
  ...over,
});
const team = [officer("Aman Avinash"), officer("Devarsh Jayakrishnan"), officer("Aanya Agarwal"), officer("Ramki Krish")];

describe("pickSender", () => {
  it("gives the same officer for the same company every time", () => {
    expect(pickSender(team, "prospect-1", null)?.id).toBe(pickSender(team, "prospect-1", null)?.id);
  });
  it("spreads companies across every officer who is turned on", () => {
    const used = new Set(Array.from({ length: 60 }, (_, i) => pickSender(team, `prospect-${i}`, null)!.id));
    expect(used.size).toBe(team.length);
  });
  it("keeps the officer already assigned, even if the list changed", () => {
    expect(pickSender(team, "prospect-1", "ramkikrish")?.name).toBe("Ramki Krish");
  });
  it("moves a company on when its officer is turned off or removed", () => {
    const off = team.map((s) => (s.id === "ramkikrish" ? { ...s, enabled: false } : s));
    expect(pickSender(off, "prospect-1", "ramkikrish")?.id).not.toBe("ramkikrish");
    expect(pickSender(team.slice(0, 2), "prospect-1", "ramkikrish")?.id).not.toBe("ramkikrish");
  });
  it("returns null when nobody is turned on, so the single sender in Settings is used", () => {
    expect(pickSender([], "p", null)).toBeNull();
    expect(pickSender(team.map((s) => ({ ...s, enabled: false })), "p", null)).toBeNull();
  });
});

describe("buildSignature", () => {
  it("names the officer, their title and their LinkedIn", () => {
    const sig = buildSignature(officer("Devarsh Jayakrishnan", { title: "Director of External Affairs", linkedin: "https://www.linkedin.com/in/devarshjayakrishnan" }), "https://www.ucsc180dc.org");
    expect(sig).toBe(
      "Best regards,\n\nDevarsh Jayakrishnan\nDirector of External Affairs | 180 Degrees Consulting\nUniversity of California, Santa Cruz\n[LinkedIn](https://www.linkedin.com/in/devarshjayakrishnan) ︱ [Learn More About Us](https://www.ucsc180dc.org)",
    );
  });
  it("shows only the website link when there is no LinkedIn", () => {
    expect(buildSignature(officer("Mallika Sinha"), "https://www.ucsc180dc.org")).toMatch(/\n\[Learn More About Us\]\(https:\/\/www.ucsc180dc.org\)$/);
    expect(buildSignature(officer("Mallika Sinha"), "https://www.ucsc180dc.org")).not.toContain("LinkedIn");
  });
});

describe("sendersProblem", () => {
  it("accepts a normal list", () => expect(sendersProblem(team)).toBeNull());
  it("rejects two officers with the same first name, because they would send from one address", () => {
    expect(sendersProblem([officer("Aman Avinash"), officer("Aman Gupta")])).toMatch(/same address/);
  });
  it("lets a turned-off officer share a first name", () => {
    expect(sendersProblem([officer("Aman Avinash"), officer("Aman Gupta", { enabled: false })])).toBeNull();
  });
  it("rejects a LinkedIn link that is not LinkedIn", () => {
    expect(sendersProblem([officer("Aman Avinash", { linkedin: "https://evil.example/aman" })])).toMatch(/LinkedIn/);
  });
  it("rejects duplicate keys", () => {
    expect(sendersProblem([officer("Aman Avinash"), officer("Aman Avinash")])).toMatch(/same key/);
  });
});

describe("parseSenders / cleanLinkedin / sendersFromRoster", () => {
  it("reads saved JSON and ignores garbage", () => {
    expect(parseSenders(JSON.stringify(team))).toEqual(team);
    expect(parseSenders("not json")).toEqual([]);
    expect(parseSenders(undefined)).toEqual([]);
    expect(parseSenders(JSON.stringify([{ id: "x" }]))).toEqual([]);
  });
  it("drops the tracking bits copied from LinkedIn", () => {
    expect(cleanLinkedin("https://www.linkedin.com/in/ramkiran-krish-2bba97236/?isSelfProfile=true")).toBe("https://www.linkedin.com/in/ramkiran-krish-2bba97236");
    expect(cleanLinkedin("https://linkedin.com/in/sudheekshanettam")).toBe("https://www.linkedin.com/in/sudheekshanettam");
    expect(cleanLinkedin(null)).toBe("");
  });
  it("fills from the execs on the roster only, in a fixed order", () => {
    const list = sendersFromRoster(
      [
        { id: "1", name: "Devarsh", role: "director_of_external_affairs", linkedin: null },
        { id: "2", name: "A Consultant", role: "consultant", linkedin: "https://linkedin.com/in/x" },
        { id: "3", name: "Sudheeksha", role: "president", linkedin: "https://linkedin.com/in/s/?a=b" },
      ],
      (r) => r.toUpperCase(),
    );
    expect(list.map((s) => s.name)).toEqual(["Sudheeksha", "Devarsh"]);
    expect(list[0]).toMatchObject({ id: "3", title: "PRESIDENT", linkedin: "https://www.linkedin.com/in/s", enabled: true });
  });
});
