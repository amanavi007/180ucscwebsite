import { USER_AGENT } from "./page";
import { YC_DATASET_URL, type YcCompany } from "./yc";

const PAGE_TIMEOUT_MS = 8_000;
const MAX_PAGE_CHARS = 400_000;

const headers = { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" };

/** A page's HTML (first 400 KB), or null when it cannot be read. Never throws. */
export async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(PAGE_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").toLowerCase().includes("html")) return null;
    return (await res.text()).slice(0, MAX_PAGE_CHARS);
  } catch {
    return null;
  }
}

/** The site's robots.txt, or empty (everything allowed) when there is none or it cannot be read. */
export async function fetchRobotsTxt(origin: string): Promise<string> {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(5_000), cache: "no-store" });
    return res.ok ? (await res.text()).slice(0, 100_000) : "";
  } catch {
    return "";
  }
}

export async function loadYcDataset(): Promise<YcCompany[]> {
  const res = await fetch(YC_DATASET_URL, { signal: AbortSignal.timeout(45_000), cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load the YC dataset (${res.status}).`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("The YC dataset was not a list of companies.");
  return data as YcCompany[];
}
