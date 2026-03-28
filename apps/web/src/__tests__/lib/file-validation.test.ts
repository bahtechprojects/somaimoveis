import { describe, it, expect } from "vitest";
import { validateMagicBytes } from "@/lib/file-validation";

describe("validateMagicBytes", () => {
  it("validates PDF magic bytes", () => {
    const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer;
    expect(validateMagicBytes(buf, "application/pdf")).toBe(true);
  });

  it("validates JPEG magic bytes", () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
    expect(validateMagicBytes(buf, "image/jpeg")).toBe(true);
  });

  it("validates PNG magic bytes", () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]).buffer;
    expect(validateMagicBytes(buf, "image/png")).toBe(true);
  });

  it("rejects invalid magic bytes for PDF", () => {
    const buf = new Uint8Array([0x00, 0x00, 0x00, 0x00]).buffer;
    expect(validateMagicBytes(buf, "application/pdf")).toBe(false);
  });

  it("rejects empty buffer", () => {
    const buf = new Uint8Array([]).buffer;
    expect(validateMagicBytes(buf, "application/pdf")).toBe(false);
  });

  it("returns true for unknown types", () => {
    const buf = new Uint8Array([0x00]).buffer;
    expect(validateMagicBytes(buf, "application/octet-stream")).toBe(true);
  });
});
