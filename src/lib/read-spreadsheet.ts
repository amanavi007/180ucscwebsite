import { parseCsvText } from "@/lib/csv-parse";

/** Browser only. Reads the first sheet of an .xlsx, or a .csv, into rows of cells (header row first). */
export async function readSpreadsheet(file: File): Promise<unknown[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsvText(await file.text());
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(file)) as unknown[][];
  }
  throw new Error("Upload an .xlsx or .csv file.");
}
