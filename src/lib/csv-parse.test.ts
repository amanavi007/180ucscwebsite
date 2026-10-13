import { describe, expect, it } from "vitest";
import { parseCsvText } from "./csv-parse";

describe("parseCsvText", () => {
  it("handles quotes, embedded commas and newlines in cells", () => {
    const text = 'a,b\n"Hello, ""world""","line1\nline2"\n';
    expect(parseCsvText(text)).toEqual([["a", "b"], ['Hello, "world"', "line1\nline2"]]);
  });
  it("tolerates BOM, CRLF and blank lines", () => {
    expect(parseCsvText("﻿a,b\r\n1,2\r\n\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("keeps a final row without a trailing newline", () => {
    expect(parseCsvText("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});
