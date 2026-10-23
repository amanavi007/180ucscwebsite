import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

// Rule: nothing a person types or pastes into may grow past the page. See "Nothing grows past the page" in docs/ui-rulebook.md.
describe("overflow guards", () => {
  it("the shared Textarea stops growing at a maximum height and scrolls", () => {
    const src = read("src/components/ui/textarea.tsx");
    expect(src).toMatch(/max-h-/);
    expect(src).toMatch(/overflow-y-auto/);
  });

  it("the shared DialogContent never grows taller than the screen and scrolls", () => {
    const src = read("src/components/ui/dialog.tsx");
    const content = src.slice(src.indexOf("function DialogContent"), src.indexOf("function DialogHeader"));
    expect(content).toMatch(/max-h-/);
    expect(content).toMatch(/overflow-y-auto/);
  });

  it("any other element that auto-sizes to its content also has a maximum height", () => {
    const offenders = sourceFiles(join(process.cwd(), "src"))
      .filter((f) => !f.endsWith("ui/textarea.tsx"))
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return text.includes("field-sizing-content") && !text.includes("max-h-");
      });
    expect(offenders).toEqual([]);
  });
});
