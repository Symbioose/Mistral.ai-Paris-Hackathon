import { AgentEmotion, VoiceType } from "@/app/lib/types";

export const VOICE_MAP: Record<VoiceType, string> = {
  authoritative_male: process.env.ELEVENLABS_VOICE_AUTHORITATIVE_MALE || "BUJMBsQ3Oq4cEeWSb48y",
  warm_female: process.env.ELEVENLABS_VOICE_WARM_FEMALE || "imRmmzTqlLHt9Do1HufF",
  assertive_female: process.env.ELEVENLABS_VOICE_ASSERTIVE_FEMALE || "EXAVITQu4vr4xnSDxMaL",
  stressed_young: process.env.ELEVENLABS_VOICE_STRESSED_YOUNG || "Xgb3SR8idOHy8scGICeJ",
  calm_narrator: process.env.ELEVENLABS_VOICE_CALM_NARRATOR || "BVBq6HVJVdnwOMJOqvy9",
  gruff_veteran: process.env.ELEVENLABS_VOICE_GRUFF_VETERAN || "F9KUTOne5xOKqAbIU7yg",
};

export const EMOTION_PARAMS: Record<AgentEmotion, { stability: number; similarity_boost: number; speed: number; style: number }> = {
  calm:       { stability: 0.75, similarity_boost: 0.75, speed: 1.0,  style: 0.1  },
  stressed:   { stability: 0.30, similarity_boost: 0.50, speed: 1.2,  style: 0.65 },
  angry:      { stability: 0.40, similarity_boost: 0.80, speed: 1.1,  style: 0.80 },
  panicked:   { stability: 0.20, similarity_boost: 0.40, speed: 1.4,  style: 0.95 },
  suspicious: { stability: 0.55, similarity_boost: 0.70, speed: 0.95, style: 0.40 },
};
