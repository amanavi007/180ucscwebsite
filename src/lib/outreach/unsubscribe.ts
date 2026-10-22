import { createHmac, timingSafeEqual } from "node:crypto";

const sign = (prospectId: string, secret: string) =>
  createHmac("sha256", secret).update(prospectId).digest("base64url");

export function signUnsubscribeToken(prospectId: string, secret: string): string {
  return `${prospectId}.${sign(prospectId, secret)}`;
}

/** Returns the prospect id when the token is genuine, otherwise null. An empty secret never verifies. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  if (!secret || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(id, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

/** The page a person lands on from the link in the email body. */
export function unsubscribeUrl(token: string, siteUrl: string): string {
  return `${siteUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** The endpoint mail clients POST to for one-click unsubscribe. */
export function oneClickUrl(token: string, siteUrl: string): string {
  return `${siteUrl}/api/outreach/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function listUnsubscribeHeaders(url: string, mailto: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>, <mailto:${mailto}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
