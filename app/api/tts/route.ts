import { NextRequest } from "next/server";
import { AgentEmotion, VoiceType } from "@/app/lib/types";
import { EMOTION_PARAMS, VOICE_MAP } from "@/app/lib/voice/voices";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

function sanitizeText(text: string): string {
  return text
    .replace(/[*_`#>\-\[\]\(\)]/g, "")
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

  const resolvedVoice = voice_id || (voice_type ? VOICE_MAP[voice_type] : VOICE_MAP.calm_narrator);
  const params = EMOTION_PARAMS[emotion || "calm"];

  const response = await fetchWithTimeout(
    `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoice}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: params.stability,
          similarity_boost: params.similarity_boost,
          style: 0.45,
          use_speaker_boost: true,
        },
      }),
    },
    12000,
  );

  if (!response.ok) {
    const error = await response.text();
    return Response.json({ error }, { status: response.status });
  }

  const bytes = await response.arrayBuffer();
  return new Response(bytes, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
