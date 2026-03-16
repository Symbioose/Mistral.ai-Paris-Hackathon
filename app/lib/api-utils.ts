import { NextResponse } from "next/server";

/**
 * Return a safe error response — never leak DB internals to the client.
 */
export function safeErrorResponse(
  userMessage: string,
  status: number,
  internalError?: unknown,
) {
  if (internalError) {
    console.error(`[API ${status}]`, internalError);
  }
  return NextResponse.json({ error: userMessage }, { status });
}
