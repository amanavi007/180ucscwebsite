import chunks from "./chunks.json";

/** One passage of the chapter knowledge base (compiled from the chapter Drive on 2026-10-08). */
export interface KbChunk {
  id: string;
  title: string;
  section: string;
  source_title: string;
  source_url: string;
  updated: string;
  text: string;
}

export const KB_CHUNKS: KbChunk[] = chunks;
