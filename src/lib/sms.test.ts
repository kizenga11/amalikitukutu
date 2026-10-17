import { describe, expect, it } from "vitest";
import { normalizePhone } from "./sms";

describe("normalizePhone", () => {
  it("normalises the common Tanzanian formats to E.164", () => {
    expect(normalizePhone("0712345678")).toBe("+255712345678");
    expect(normalizePhone("0755 123 456")).toBe("+255755123456");
    expect(normalizePhone("+255712345678")).toBe("+255712345678");
    expect(normalizePhone("255712345678")).toBe("+255712345678");
    expect(normalizePhone("712345678")).toBe("+255712345678");
    expect(normalizePhone("0655-123-456")).toBe("+255655123456");
  });

  it("rejects missing or invalid numbers", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("0812345678")).toBeNull();
    expect(normalizePhone("+254712345678")).toBeNull();
  });
});
