import { describe, expect, it } from "vitest";
import {
  byteLength,
  codeFromAnswerHtml,
  codeToAnswerHtml,
  escapeHtml,
  parseCompilerDiagnostics,
  unescapeHtml,
} from "./code-errors";

describe("parseCompilerDiagnostics", () => {
  it("parses g++ errors, warnings and notes", () => {
    const output = [
      "main.cpp: In function 'int main()':",
      "main.cpp:5:5: error: 'cout' was not declared in this scope",
      "    5 |     cout << \"hi\";",
      "      |     ^~~~",
      "main.cpp:5:5: note: suggested alternative: 'std::cout'",
      "main.cpp:9:1: warning: control reaches end of non-void function [-Wreturn-type]",
    ].join("\n");

    expect(parseCompilerDiagnostics(output)).toEqual([
      {
        file: "main.cpp",
        line: 5,
        column: 5,
        severity: "error",
        message: "'cout' was not declared in this scope",
      },
      {
        file: "main.cpp",
        line: 5,
        column: 5,
        severity: "note",
        message: "suggested alternative: 'std::cout'",
      },
      {
        file: "main.cpp",
        line: 9,
        column: 1,
        severity: "warning",
        message: "control reaches end of non-void function [-Wreturn-type]",
      },
    ]);
  });

  it("accepts diagnostics without a column and treats fatal errors as errors", () => {
    const output = [
      "main.cpp:3: fatal error: iostream: No such file or directory",
      "main.cpp:7:2: error: expected ';' before 'return'",
    ].join("\n");

    expect(parseCompilerDiagnostics(output)).toEqual([
      {
        file: "main.cpp",
        line: 3,
        column: 0,
        severity: "error",
        message: "iostream: No such file or directory",
      },
      {
        file: "main.cpp",
        line: 7,
        column: 2,
        severity: "error",
        message: "expected ';' before 'return'",
      },
    ]);
  });

  it("ignores source excerpts, blank lines and duplicates", () => {
    const output = [
      "    5 |     int x = ;",
      "",
      "main.cpp:5:13: error: expected primary-expression before ';' token",
      "main.cpp:5:13: error: expected primary-expression before ';' token",
      "compilation terminated.",
    ].join("\n");

    const diagnostics = parseCompilerDiagnostics(output);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].line).toBe(5);
  });

  it("returns an empty array for empty output", () => {
    expect(parseCompilerDiagnostics("")).toEqual([]);
  });
});

describe("html escaping", () => {
  it("escapes and unescapes the C++ characters that matter", () => {
    const code = '#include <iostream>\nint main() { std::cout << "a & b"; }';
    const escaped = escapeHtml(code);
    expect(escaped).toContain("&lt;iostream&gt;");
    expect(escaped).toContain("&amp;");
    expect(unescapeHtml(escaped)).toBe(code);
  });

  it("round-trips code through answer HTML", () => {
    const code = '#include <iostream>\n\nint main() {\n  std::cout << "Hello, dunia!" << std::endl;\n  return 0;\n}\n';
    const html = codeToAnswerHtml(code);
    expect(html.startsWith("<pre><code>")).toBe(true);
    expect(html).not.toContain("<iostream>");
    expect(codeFromAnswerHtml(html)).toBe(code);
  });

  it("normalises CRLF line endings", () => {
    expect(codeFromAnswerHtml(codeToAnswerHtml("a\r\nb\r\nc"))).toBe("a\nb\nc");
  });

  it("recovers text from a non-code rich-text answer", () => {
    expect(codeFromAnswerHtml("<p>hello</p><p>world</p>")).toBe("hello\nworld");
  });

  it("returns an empty string for an empty answer", () => {
    expect(codeFromAnswerHtml("")).toBe("");
  });
});

describe("byteLength", () => {
  it("counts UTF-8 bytes rather than characters", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("mzizi")).toBe(5);
    expect(byteLength("✓")).toBe(3);
  });
});
