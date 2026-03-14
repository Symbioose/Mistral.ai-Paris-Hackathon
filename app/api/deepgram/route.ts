import { NextResponse } from "next/server";

/**
 * Returns a short-lived Deepgram temporary key for client-side WebSocket connection.
 * Uses the Deepgram Keys API to create a scoped, time-limited key instead of
 * exposing the main API key to the browser.
 */
export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY not configured" },
      { status: 500 },
    );
  }

  // Create a short-lived temporary key via Deepgram's API
  try {
    const projectId = process.env.DEEPGRAM_PROJECT_ID;
    if (!projectId) {
      // SECURITY: Never expose the main API key to the client in production.
      // DEEPGRAM_PROJECT_ID is required to create scoped, short-lived keys.
      console.error(
        "[deepgram] DEEPGRAM_PROJECT_ID not set. Cannot create scoped temporary key. " +
        "Set DEEPGRAM_PROJECT_ID in environment variables for production deployment."
      );
      return NextResponse.json(
        { error: "Deepgram STT not configured for production (missing project ID)." },
        { status: 503 },
      );
    }

    const response = await fetch(
      `https://api.deepgram.com/v1/projects/${projectId}/keys`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment: `Temp key ${Date.now()}`,
          scopes: ["usage:write"],
          time_to_live_in_seconds: 60,
        }),
      },
    );

    if (!response.ok) {
      console.error("[deepgram] Failed to create temp key:", response.status, await response.text());
      // Do NOT fall back to main key on auth failure — that could leak credentials
      return NextResponse.json(
        { error: "Failed to create temporary Deepgram key" },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json({ apiKey: data.key });
  } catch (error) {
    console.error("[deepgram] Error creating temp key:", error);
    return NextResponse.json(
      { error: "Failed to create temporary Deepgram key" },
      { status: 502 },
    );
  }
}
