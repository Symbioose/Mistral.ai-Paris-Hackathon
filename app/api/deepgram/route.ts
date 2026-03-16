import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";

/**
 * Returns a short-lived Deepgram temporary key for client-side WebSocket connection.
 * Uses the Deepgram Keys API to create a scoped, time-limited key instead of
 * exposing the main API key to the browser.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

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
      // Development fallback: return main key directly when project ID is not configured.
      // In production, always set DEEPGRAM_PROJECT_ID to use scoped short-lived keys.
      if (process.env.NODE_ENV === "production") {
        console.error("[deepgram] DEEPGRAM_PROJECT_ID not set — required in production.");
        return NextResponse.json(
          { error: "Deepgram STT not configured for production (missing project ID)." },
          { status: 503 },
        );
      }
      console.warn("[deepgram] No DEEPGRAM_PROJECT_ID — using main key (dev only).");
      return NextResponse.json({ apiKey });
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
