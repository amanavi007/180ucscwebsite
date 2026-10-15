import type { ReviewKind } from "./rubric";

export const MAX_PDF_BYTES = 15 * 1024 * 1024;

export type DriveErrorCode = "denied" | "not_found" | "too_large" | "unsupported" | "failed";

export class DriveError extends Error {
  constructor(public code: DriveErrorCode) {
    super(code);
  }
}

export function driveErrorMessage(code: DriveErrorCode): string {
  switch (code) {
    case "denied":
      return "Google would not let the portal open that file. Choose it again from Drive and allow access.";
    case "not_found":
      return "That file could not be found in Drive.";
    case "too_large":
      return "That file is too large to review. Try a smaller one.";
    case "unsupported":
      return "Only Google Docs and Google Slides can be reviewed. Open other files as a Google Doc first.";
    case "failed":
      return "Google Drive did not respond. Please try again.";
  }
}

export function kindForMime(mime: string): ReviewKind | null {
  if (mime === "application/vnd.google-apps.document") return "doc";
  if (mime === "application/vnd.google-apps.presentation") return "slides";
  return null;
}

interface SlidesTextRun {
  textRun?: { content?: string };
}
interface SlidesPresentation {
  slides?: { pageElements?: { shape?: { text?: { textElements?: SlidesTextRun[] } } }[] }[];
}

/** One string per slide: every text run of every shape, in order, trimmed. */
export function slideTexts(p: SlidesPresentation): string[] {
  return (p.slides ?? []).map((slide) =>
    (slide.pageElements ?? [])
      .map((el) => (el.shape?.text?.textElements ?? []).map((t) => t.textRun?.content ?? "").join(""))
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n"),
  );
}

export interface DriveFile {
  id: string;
  name: string;
  url: string;
  kind: ReviewKind;
  text: string;
  slideTexts: string[];
  pdf: Uint8Array;
}

async function gfetch(url: string, token: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new DriveError("failed");
  }
  if (!res.ok) {
    // Google's reason (for example API not enabled) is the only way to tell causes apart; the token is never logged.
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    console.error(`drive request failed: ${res.status} ${url.split("?")[0]} ${detail}`);
  }
  if (res.status === 401 || res.status === 403) throw new DriveError("denied");
  if (res.status === 404) throw new DriveError("not_found");
  if (!res.ok) throw new DriveError("failed");
  return res;
}

export async function fetchDriveFile(fileId: string, token: string): Promise<DriveFile> {
  const id = encodeURIComponent(fileId);
  const meta = (await (
    await gfetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,webViewLink`, token)
  ).json()) as { id: string; name: string; mimeType: string; webViewLink?: string };

  const kind = kindForMime(meta.mimeType);
  if (!kind) throw new DriveError("unsupported");

  const pdfRes = await gfetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application/pdf`, token);
  const pdf = new Uint8Array(await pdfRes.arrayBuffer());
  if (pdf.byteLength > MAX_PDF_BYTES) throw new DriveError("too_large");

  let text = "";
  let slides: string[] = [];
  if (kind === "doc") {
    text = await (await gfetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`, token)).text();
  } else {
    const pres = (await (await gfetch(`https://slides.googleapis.com/v1/presentations/${id}`, token)).json()) as SlidesPresentation;
    slides = slideTexts(pres);
    text = slides.map((s, i) => `--- Slide ${i + 1} ---\n${s}`).join("\n\n");
  }

  return { id: meta.id, name: meta.name, url: meta.webViewLink ?? `https://drive.google.com/open?id=${meta.id}`, kind, text, slideTexts: slides, pdf };
}
