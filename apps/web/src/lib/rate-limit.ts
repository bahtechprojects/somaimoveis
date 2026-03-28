const store = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number): { success: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { success: false, remaining: 0, retryAfter };
  }

  entry.count++;
  return { success: true, remaining: limit - entry.count, retryAfter: 0 };
}

// For testing
export function resetRateLimitStore() {
  store.clear();
}
