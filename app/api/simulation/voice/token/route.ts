import { isSameOrigin } from "@/app/lib/simulation/http";
import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

// Short-lived browser credentials for speech. Gradium is the production provider;
// an explicit development flag enables Deepgram STT and the HTTP TTS fallback.
export function GET() {
  return NextResponse.json(
    {
      provider: process.env.GRADIUM_API_KEY
        ? "gradium"
        : process.env.SIMULATION_ENABLE_VOICE_FALLBACK === "true"
          ? "fallback"
          : "unavailable",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Connectez-vous pour activer le microphone." },
      { status: 401 },
    );
  const headers = { "Cache-Control": "no-store" };
  const key = process.env.GRADIUM_API_KEY;
  if (key) {
    try {
      const response = await fetch(
        "https://eu.api.gradium.ai/api/api-keys/token",
        {
          method: "GET",
          headers: { "x-api-key": key },
          signal: AbortSignal.timeout(10000),
          cache: "no-store",
        },
      );
      if (!response.ok) throw new Error("token");
      const data = await response.json();
      return NextResponse.json(
        {
          provider: "gradium",
          token: data.token,
          expires_at: data.expires_at,
          host: "eu.api.gradium.ai",
          voiceId: process.env.GRADIUM_VOICE_ID || "iEu63s1rhn_kegTr",
        },
        { headers },
      );
    } catch {
      return NextResponse.json(
        {
          error:
            "Le service vocal ne répond pas. Réessayez ou continuez par écrit.",
        },
        { status: 502 },
      );
    }
  }
  if (process.env.SIMULATION_ENABLE_VOICE_FALLBACK !== "true")
    return NextResponse.json(
      {
        error:
          "La voix est en cours de configuration. Vous pouvez poursuivre par écrit.",
      },
      { status: 503 },
    );
  const deepgram = process.env.DEEPGRAM_API_KEY,
    project = process.env.DEEPGRAM_PROJECT_ID;
  if (!deepgram || !project || !process.env.OPENAI_API_KEY)
    return NextResponse.json(
      {
        error:
          "La voix est en cours de configuration. Vous pouvez poursuivre par écrit.",
      },
      { status: 503 },
    );
  try {
    const response = await fetch(
      `https://api.deepgram.com/v1/projects/${project}/keys`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${deepgram}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment: `yougotit ${user.id}`,
          scopes: ["usage:write"],
          time_to_live_in_seconds: 120,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error("token");
    const data = await response.json();
    return NextResponse.json(
      { provider: "fallback", token: data.key },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Le service vocal ne répond pas. Réessayez ou continuez par écrit.",
      },
      { status: 502 },
    );
  }
}
