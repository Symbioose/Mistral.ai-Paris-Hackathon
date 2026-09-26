import { createClient } from "@/app/lib/supabase/server";

// Fallback TTS used when Gradium is not configured: streams raw PCM16 mono 24 kHz,
// the same format as the Gradium path, so playback and HeadAudio lip-sync are identical.
export const maxDuration = 60;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "Origine refusée" }, { status: 403 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json({ error: "Non authentifié" }, { status: 401 });
  if (process.env.SIMULATION_ENABLE_VOICE_FALLBACK !== "true")
    return Response.json(
      { error: "Voix de secours désactivée." },
      { status: 503 },
    );
  const key = process.env.OPENAI_API_KEY;
  if (!key)
    return Response.json({ error: "Voix indisponible." }, { status: 503 });

  let body: { text?: unknown; voice?: unknown; style?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Objet JSON requis" }, { status: 400 });
  const text =
    typeof body.text === "string"
      ? body.text.replace(/[*_`#>]/g, "").trim()
      : "";
  if (!text || text.length > 1200)
    return Response.json(
      { error: "Texte (1–1200 caractères) requis" },
      { status: 400 },
    );
  const voice =
    typeof body.voice === "string" && /^[a-z]{2,20}$/.test(body.voice)
      ? body.voice
      : process.env.SIMULATION_FALLBACK_VOICE || "coral";
  const style = typeof body.style === "string" ? body.style.slice(0, 400) : "";

  const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.SIMULATION_FALLBACK_TTS_MODEL || "gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "pcm",
      instructions: `Français de France, conversation professionnelle naturelle, débit fluide, pas de ton publicitaire. ${style}`,
    }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  if (!upstream?.ok || !upstream.body) {
    console.error("[simulation speak]", upstream?.status);
    return Response.json(
      { error: "La voix ne répond pas. Le texte reste affiché." },
      { status: 502 },
    );
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/pcm;rate=24000",
      "Cache-Control": "no-store",
    },
  });
}
