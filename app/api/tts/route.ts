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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const payload = JSON.stringify({
    text: cleanText,
    model_id: ELEVENLABS_MODEL_ID,
    voice_settings: {
      stability: params.stability,
      similarity_boost: params.similarity_boost,
      style: params.style ?? 0.3,
      use_speaker_boost: true,
    },
  });

  const headers = {
    "xi-api-key": ELEVENLABS_API_KEY,
    "Content-Type": "application/json",
    Accept: "audio/mpeg",
  };

  const streamUrl = `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoice}/stream`;
  const standardUrl = `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoice}`;
  let response: Response | null = null;
  let lastError = "";

  // Try streaming endpoint first with retries on transient conflicts/rate limits.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetchWithTimeout(
      streamUrl,
      {
        method: "POST",
        headers,
        body: payload,
      },
      20000,
    );

    if (response.ok) break;
    lastError = await response.text();
    if (response.status === 409 || response.status === 429 || response.status >= 500) {
      await sleep(220 * (attempt + 1));
      continue;
    }
    break;
  }

  // Fallback to non-streaming synthesis if stream endpoint keeps conflicting.
  if (!response?.ok) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetchWithTimeout(
        standardUrl,
        {
          method: "POST",
          headers,
          body: payload,
        },
        20000,
      );
      if (response.ok) break;
      lastError = await response.text();
      if (response.status === 409 || response.status === 429 || response.status >= 500) {
        await sleep(260 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  if (!response?.ok) {
    return Response.json({ error: lastError || "ElevenLabs request failed." }, { status: response?.status || 502 });
  }

  // Pipe the stream directly — no server-side buffering
  return new Response(response.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
