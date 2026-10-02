import { describe, expect, it } from "vitest";
import { emailProviderOrder, resendFromAddress } from "./provider";

describe("emailProviderOrder", () => {
  it("uses Resend alone by default", () => {
    expect(emailProviderOrder({})).toEqual(["resend"]);
  });

  it("tries Gmail first, then Resend, when a Gmail account is fully configured", () => {
    expect(emailProviderOrder({ GMAIL_USER: "club@gmail.com", GMAIL_APP_PASSWORD: "pw" })).toEqual(["gmail", "resend"]);
  });

  it("ignores empty or partial Gmail settings (blank lines in .env.local)", () => {
    expect(emailProviderOrder({ GMAIL_USER: "", GMAIL_APP_PASSWORD: "" })).toEqual(["resend"]);
    expect(emailProviderOrder({ GMAIL_USER: "club@gmail.com" })).toEqual(["resend"]);
  });

  it("lets EMAIL_PROVIDER pin a single provider with no fallback", () => {
    const gmail = { GMAIL_USER: "club@gmail.com", GMAIL_APP_PASSWORD: "pw" };
    expect(emailProviderOrder({ ...gmail, EMAIL_PROVIDER: "resend" })).toEqual(["resend"]);
    expect(emailProviderOrder({ EMAIL_PROVIDER: "gmail" })).toEqual(["gmail"]);
  });

  it("ignores an unknown EMAIL_PROVIDER value", () => {
    expect(emailProviderOrder({ EMAIL_PROVIDER: "mailgun" })).toEqual(["resend"]);
  });
});

describe("resendFromAddress", () => {
  it("prefers EMAIL_FROM", () => {
    expect(resendFromAddress({ EMAIL_FROM: "a@x.com", COFFEE_CHAT_FROM_EMAIL: "b@x.com" })).toBe("a@x.com");
  });

  it("falls back to the legacy COFFEE_CHAT_FROM_EMAIL", () => {
    expect(resendFromAddress({ COFFEE_CHAT_FROM_EMAIL: "b@x.com" })).toBe("b@x.com");
    expect(resendFromAddress({ EMAIL_FROM: "", COFFEE_CHAT_FROM_EMAIL: "b@x.com" })).toBe("b@x.com");
  });

  it("is undefined when neither is set", () => {
    expect(resendFromAddress({})).toBeUndefined();
  });
});
