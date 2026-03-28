import { describe, it, expect } from "vitest";

function parseDateSafe(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  if (dateStr.includes("T")) return new Date(dateStr);
  return new Date(dateStr + "T12:00:00");
}

describe("date handling", () => {
  it("'2026-03-15' parsed with T12:00:00 results in day 15 (not 14)", () => {
    const date = parseDateSafe("2026-03-15");
    expect(date).not.toBeNull();
    expect(date!.getDate()).toBe(15);
  });

  it("ISO string with T is not double-appended", () => {
    const date = parseDateSafe("2026-03-15T10:00:00");
    expect(date).not.toBeNull();
    expect(date!.getDate()).toBe(15);
    expect(date!.getHours()).toBe(10);
  });

  it("null date returns null", () => {
    const date = parseDateSafe(null);
    expect(date).toBeNull();
  });
});
