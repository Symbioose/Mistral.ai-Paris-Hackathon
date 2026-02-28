import { NextRequest } from "next/server";
import { AgentEmotion, VoiceType } from "@/app/lib/types";
import { EMOTION_PARAMS, VOICE_MAP } from "@/app/lib/voice/voices";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";
const FIXED_NARRATOR_VOICE_ID =
  process.env.ELEVENLABS_VOICE_NARRATOR_FIXED ||
  process.env.ELEVENLABS_VOICE_CALM_NARRATOR ||
  VOICE_MAP.calm_narrator;

function sanitizeText(text: string): string {
  const cleaned = text
    // Keep content, remove markdown wrappers only.
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    // Strip markdown control chars when they are formatting prefixes.
    .replace(/^\s{0,3}[#>]+\s?/gm, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Smooth punctuation for realtime spoken flow:
  // - soften hard pauses on ":" and ";"
  // - turn most intra-paragraph sentence breaks into commas
  // - keep final punctuation for natural ending
  const softened = cleaned
    .replace(/\s*:\s*/g, ", ")
    .replace(/\s*;\s*/g, ", ")
    .replace(/\.{2,}/g, ".")
    .replace(/([A-Za-zÀ-ÿ0-9])\.\s+(?=[A-ZÀ-Ý])/g, "$1, ");

  return softened
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const { text, voice_id, voice_type, emotion } = await req.json() as {
    text: string;
    voice_id?: string;
    voice_type?: VoiceType;
    emotion?: AgentEmotion;
  };

  const cleanText = sanitizeText(String(text || ""));
  if (!cleanText) {
    return Response.json({ error: "Text is empty." }, { status: 400 });
  }

  const resolvedVoice =
    voice_type === "calm_narrator"
      ? FIXED_NARRATOR_VOICE_ID
      : (voice_id || (voice_type ? VOICE_MAP[voice_type] : VOICE_MAP.calm_narrator));
  const params = EMOTION_PARAMS[emotion || "calm"];

  const response = await fetchWithTimeout(
    `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoice}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: params.stability,
          similarity_boost: params.similarity_boost,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    },
    20000,
  );

  if (!response.ok) {
    const error = await response.text();
    return Response.json({ error }, { status: response.status });
  }

  // Pipe the stream directly — no server-side buffering
  return new Response(response.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
