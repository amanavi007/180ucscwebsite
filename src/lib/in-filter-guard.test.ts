import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `.in(column, ids)` puts every id in the request URL, and PostgREST answers "Bad Request" once that gets long. That is
 * how the scheduling page broke when slots piled up. So an `.in()` whose list can grow with the data must go through
 * `fetchInChunks` / `runInChunks` / `chunkIds` (src/lib/paginate.ts), where the list is the callback's `chunk`.
 *
 * Allowed without a marker: the `chunk` argument of those helpers, a literal array, or an UPPER_CASE constant. Anything else needs
 * `// in-ok: <why the list is small>` on the same or the previous line.
 */
const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** A list written out in the source (`["a", "b"]`), a CONSTANT, or `Object.values(CONSTANT)`: it cannot grow with the data. */
function isBoundedLiteral(arg: string): boolean {
  if (/^\[\s*(?:(?:"[^"]*"|'[^']*'|[\w.]+)\s*,?\s*)+\]$/.test(arg)) return true;
  return /^[A-Z][A-Z0-9_]*$/.test(arg) || /^Object\.values\([A-Z][A-Z0-9_]*\)$/.test(arg);
}

/** Every `.in(column, list)` call in the text, found by balancing parentheses so nested calls in the list don't hide it. */
function inCalls(text: string): { index: number; arg: string }[] {
  const calls: { index: number; arg: string }[] = [];
  for (const start of text.matchAll(/\.in\(/g)) {
    let depth = 1;
    let i = start.index + start[0].length;
    const open = i;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
    }
    const args = text.slice(open, i - 1);
    const comma = args.indexOf(",");
    if (comma === -1) continue;
    calls.push({ index: start.index, arg: args.slice(comma + 1).trim().replace(/,$/, "").trim() });
  }
  return calls;
}

describe("supabase .in() filters", () => {
  it("never take an unbounded id list directly", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      if (file.endsWith("lib/paginate.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const { index, arg } of inCalls(text)) {
        if (arg === "chunk" || arg === "c" || isBoundedLiteral(arg)) continue;
        const before = text.slice(0, index);
        const line = before.split("\n").length;
        const lines = text.split("\n");
        const marked = /in-ok:/.test(lines[line - 1] ?? "") || /in-ok:/.test(lines[line - 2] ?? "");
        if (!marked) offenders.push(`${file.slice(ROOT.length + 1)}:${line}  .in(…, ${arg.slice(0, 50)})`);
      }
    }
    expect(offenders, "Chunk these with fetchInChunks/runInChunks, or mark `// in-ok: <why small>`").toEqual([]);
  });
});
