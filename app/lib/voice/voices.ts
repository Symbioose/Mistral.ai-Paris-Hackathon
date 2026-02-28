import { AgentEmotion, VoiceType } from "@/app/lib/types";

export const VOICE_MAP: Record<VoiceType, string> = {
  authoritative_male: process.env.ELEVENLABS_VOICE_AUTHORITATIVE_MALE || "ErXwobaYiN019PkySvjV",
  warm_female: process.env.ELEVENLABS_VOICE_WARM_FEMALE || "EXAVITQu4vr4xnSDxMaL",
  stressed_young: process.env.ELEVENLABS_VOICE_STRESSED_YOUNG || "pNInz6obpgDQGcFmaJgB",
  calm_narrator: process.env.ELEVENLABS_VOICE_CALM_NARRATOR || "onwK4e9ZLuTAKqWW03F9",
  gruff_veteran: process.env.ELEVENLABS_VOICE_GRUFF_VETERAN || "TxGEqnHWrfWFTfGW9XjX",
};

export const EMOTION_PARAMS: Record<AgentEmotion, { stability: number; similarity_boost: number; speed: number }> = {
  calm: { stability: 0.75, similarity_boost: 0.75, speed: 1.0 },
  stressed: { stability: 0.3, similarity_boost: 0.5, speed: 1.2 },
  angry: { stability: 0.4, similarity_boost: 0.8, speed: 1.1 },
  panicked: { stability: 0.2, similarity_boost: 0.4, speed: 1.4 },
  suspicious: { stability: 0.55, similarity_boost: 0.7, speed: 0.95 },
};
