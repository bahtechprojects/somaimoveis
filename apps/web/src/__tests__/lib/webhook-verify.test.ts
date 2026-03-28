import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyWebhookSignature } from "@/lib/webhook-verify";

describe("verifyWebhookSignature", () => {
  const secret = "test-secret";
  const body = '{"event":"payment"}';

  function validSignature(rawBody: string, s: string) {
    return crypto.createHmac("sha256", s).update(rawBody).digest("hex");
  }

  it("returns true for valid signature", () => {
    const sig = validSignature(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it("returns false for invalid signature", () => {
    expect(verifyWebhookSignature(body, "invalidsig", secret)).toBe(false);
  });

  it("returns false for empty signature", () => {
    expect(verifyWebhookSignature(body, "", secret)).toBe(false);
  });

  it("returns false for empty secret", () => {
    const sig = validSignature(body, secret);
    expect(verifyWebhookSignature(body, sig, "")).toBe(false);
  });

  it("uses timing-safe comparison (different length returns false)", () => {
    expect(verifyWebhookSignature(body, "short", secret)).toBe(false);
  });
});
