export interface Founder {
  name: string;
  title: string | null;
  linkedinUrl: string | null;
}

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Founders listed on a Y Combinator company page, which carries its data as JSON in the page's data-page attribute. */
export function parseYcFounders(html: string): Founder[] {
  const raw = /data-page="([^"]+)"/.exec(html)?.[1];
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(decode(raw))?.props?.company?.founders;
    if (!Array.isArray(list)) return [];
    return list.flatMap((f: { full_name?: unknown; title?: unknown; linkedin_url?: unknown }) => {
      const name = typeof f.full_name === "string" ? f.full_name.trim() : "";
      if (!name) return [];
      const linkedin = typeof f.linkedin_url === "string" && /^https?:\/\//i.test(f.linkedin_url) ? f.linkedin_url : null;
      return [{ name, title: typeof f.title === "string" && f.title.trim() ? f.title.trim() : null, linkedinUrl: linkedin }];
    });
  } catch {
    return [];
  }
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/**
 * The founder an email address belongs to, when it plainly does: the first name alone, first.last, firstlast, or first
 * initial plus last name. Generic inboxes never match, and neither does a first name two founders share.
 */
export function matchFounderToEmail(email: string, founders: Founder[]): Founder | null {
  const local = plain(email.split("@")[0]);
  if (!local) return null;
  const forms = (f: Founder) => {
    const parts = f.name.trim().split(/\s+/);
    const first = plain(parts[0]);
    const last = plain(parts.slice(1).join(""));
    if (!first) return [];
    return last ? [first, first + last, first + last[0], first[0] + last] : [first];
  };
  const hits = founders.filter((f) => forms(f).includes(local));
  return hits.length === 1 ? hits[0] : null;
}
