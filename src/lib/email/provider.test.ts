import { describe, expect, it } from "vitest";
import { chooseEmailProvider } from "./provider";

describe("chooseEmailProvider", () => {
  it("uses Resend by default", () => {
    expect(chooseEmailProvider({})).toBe("resend");
  });

  it("uses Gmail automatically when a Gmail address is configured", () => {
    expect(chooseEmailProvider({ GMAIL_USER: "club@gmail.com" })).toBe("gmail");
  });

  it("ignores an empty Gmail address (the blank line in .env.local)", () => {
    expect(chooseEmailProvider({ GMAIL_USER: "" })).toBe("resend");
  });

  it("lets EMAIL_PROVIDER override the automatic choice", () => {
    expect(chooseEmailProvider({ GMAIL_USER: "club@gmail.com", EMAIL_PROVIDER: "resend" })).toBe("resend");
    expect(chooseEmailProvider({ EMAIL_PROVIDER: "gmail" })).toBe("gmail");
  });

  it("falls back to the automatic choice for an unknown EMAIL_PROVIDER value", () => {
    expect(chooseEmailProvider({ EMAIL_PROVIDER: "mailgun" })).toBe("resend");
  });
});
