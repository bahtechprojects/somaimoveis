import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, resetRateLimitStore } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimitStore();
    vi.restoreAllMocks();
  });

  it("allows requests under limit", () => {
    const result = checkRateLimit("key1", 5, 60000);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests over limit", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("key2", 3, 60000);
    }
    const result = checkRateLimit("key2", 3, 60000);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    for (let i = 0; i < 3; i++) {
      checkRateLimit("key3", 3, 1000);
    }
    expect(checkRateLimit("key3", 3, 1000).success).toBe(false);

    vi.spyOn(Date, "now").mockReturnValue(now + 1001);
    expect(checkRateLimit("key3", 3, 1000).success).toBe(true);
  });

  it("independent keys don't interfere", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("keyA", 3, 60000);
    }
    expect(checkRateLimit("keyA", 3, 60000).success).toBe(false);
    expect(checkRateLimit("keyB", 3, 60000).success).toBe(true);
  });

  it("returns correct remaining count", () => {
    expect(checkRateLimit("key5", 5, 60000).remaining).toBe(4);
    expect(checkRateLimit("key5", 5, 60000).remaining).toBe(3);
    expect(checkRateLimit("key5", 5, 60000).remaining).toBe(2);
  });

  it("returns retryAfter > 0 when blocked", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("key6", 3, 60000);
    }
    const result = checkRateLimit("key6", 3, 60000);
    expect(result.success).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });
});
