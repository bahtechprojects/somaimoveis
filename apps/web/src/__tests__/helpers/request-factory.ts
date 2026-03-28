import { NextRequest } from "next/server";

export function createJsonRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>
): NextRequest {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };

  if (body) {
    init.body = JSON.stringify(body);
  }

  return new NextRequest(new URL(url, "http://localhost"), init);
}
