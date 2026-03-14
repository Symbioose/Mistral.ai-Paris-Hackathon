import { NextResponse } from "next/server";

/**
 * Returns a Deepgram API key for client-side WebSocket connection.
 * In production, this should create a short-lived temporary key
 * via Deepgram's key management API with restricted scopes.
 */
export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY not configured" },
      { status: 500 },
    );
  }

  return NextResponse.json({ apiKey });
}
