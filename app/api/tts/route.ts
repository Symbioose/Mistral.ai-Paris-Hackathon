import { NextRequest, NextResponse } from "next/server";
import { AgentEmotion, VoiceType } from "@/app/lib/types";
import { EMOTION_PARAMS, VOICE_MAP } from "@/app/lib/voice/voices";
import { createClient } from "@/app/lib/supabase/server";

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
  // - collapse multiple dots into single period
  const softened = cleaned
    .replace(/\s*:\s*/g, ", ")
    .replace(/\s*;\s*/g, ", ")
    .replace(/\.{2,}/g, ".");

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
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!ELEVENLABS_API_KEY) {
    return Response.json({ error: "ELEVENLABS_API_KEY not configured." }, { status: 500 });
  }

  let body: { text?: string; voice_id?: string; voice_type?: VoiceType; emotion?: AgentEmotion };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { text, voice_id, voice_type, emotion } = body as {
    text: string;
    voice_id?: string;
    voice_type?: VoiceType;
    emotion?: AgentEmotion;
  };

  const cleanText = sanitizeText(String(text || ""));
  if (!cleanText) {
    return Response.json({ error: "Text is empty." }, { status: 400 });
  }

  // Limit TTS text length to prevent abuse
  const MAX_TTS_LENGTH = 1000;
  const truncatedText = cleanText.length > MAX_TTS_LENGTH ? cleanText.slice(0, MAX_TTS_LENGTH) : cleanText;

  const resolvedVoice =
    voice_type === "calm_narrator"
      ? FIXED_NARRATOR_VOICE_ID
      : (voice_id || (voice_type ? VOICE_MAP[voice_type] : VOICE_MAP.calm_narrator));

  // Validate voice ID to prevent URL injection (must be alphanumeric ElevenLabs ID)
  if (!resolvedVoice || !/^[a-zA-Z0-9]{10,30}$/.test(resolvedVoice)) {
    return Response.json({ error: "Invalid voice ID." }, { status: 400 });
  }

  const params = EMOTION_PARAMS[emotion || "calm"] || EMOTION_PARAMS.calm;

  const payload = JSON.stringify({
    text: truncatedText,
    model_id: ELEVENLABS_MODEL_ID,
    voice_settings: {
      stability: params.stability,
      similarity_boost: params.similarity_boost,
      style: params.style ?? 0.3,
      speed: params.speed ?? 1.0,
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
