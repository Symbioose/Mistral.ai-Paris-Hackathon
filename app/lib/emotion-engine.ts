// ============================================
// Deterministic Emotion Engine
// ============================================
// Replaces the parallel LLM orchestration call for emotion updates.
// Pure algorithmic computation — no LLM calls, no latency.

import { EmotionState, EmotionEvent, EmotionType, AgentEmotion } from "@/app/lib/types";

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

export const DEFAULT_EMOTION: EmotionState = {
  current: "neutral",
  intensity: 0.2,
  trajectory: "stable",
};

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

function clampIntensity(v: number): number {
  return Math.max(0.0, Math.min(1.0, v));
}

export function computeNextEmotion(
  currentEmotion: EmotionState,
  event: EmotionEvent,
): EmotionState {
  const prev = currentEmotion;

  switch (event.type) {
    case "correct_answer": {
      if (event.firstTry) {
        return {
          current: "pleased",
          intensity: 0.4,
          trajectory: "cooling",
          reason: "Bonne reponse du premier coup",
        };
      }
      // Correct after failures
      return {
        current: "relieved",
        intensity: 0.3,
        trajectory: "cooling",
        reason: "Bonne reponse apres difficultes",
      };
    }

    case "wrong_answer": {
      if (event.failCount <= 1) {
        // First failure
        return {
          current: "annoyed",
          intensity: clampIntensity(prev.intensity + 0.15),
          trajectory: "escalating",
          reason: "Premiere erreur du joueur",
        };
      }
      // Second+ failure
      return {
        current: "angry",
        intensity: clampIntensity(Math.max(0.7, prev.intensity + 0.15)),
        trajectory: "escalating",
        reason: "Erreurs repetees du joueur",
      };
    }

    case "hesitation": {
      if (event.responseTimeMs > 15000) {
        return {
          current: "suspicious",
          intensity: clampIntensity(prev.intensity + 0.1),
          trajectory: "escalating",
          reason: "Temps de reponse tres long",
        };
      }
      if (event.responseTimeMs > 8000) {
        return {
          current: "suspicious",
          intensity: clampIntensity(prev.intensity + 0.05),
          trajectory: "stable",
          reason: "Hesitation du joueur",
        };
      }
      // Fast response — no change
      return prev;
    }

    case "learning_complete": {
      return {
        current: "neutral",
        intensity: 0.2,
        trajectory: "stable",
        reason: "Phase d'apprentissage terminee",
      };
    }

    case "act_change": {
      return {
        current: "neutral",
        intensity: 0.2,
        trajectory: "stable",
        reason: "Nouvel acte, nouvel agent",
      };
    }

    default:
      return prev;
  }
}

// ---------------------------------------------------------------------------
// Decay: apply after each successful interaction to gradually calm down
// ---------------------------------------------------------------------------

export function decayEmotion(emotion: EmotionState): EmotionState {
  if (emotion.trajectory === "cooling" || emotion.current === "neutral") {
    const newIntensity = clampIntensity(emotion.intensity - 0.1);
    if (newIntensity <= 0.15) {
      return { current: "neutral", intensity: 0.15, trajectory: "stable" };
    }
    return { ...emotion, intensity: newIntensity };
  }
  return emotion;
}

// ---------------------------------------------------------------------------
// Map EmotionState → existing TTS AgentEmotion keys
// ---------------------------------------------------------------------------

const EMOTION_TO_TTS: Record<EmotionType, AgentEmotion> = {
  neutral: "calm",
  pleased: "calm",
  relieved: "calm",
  annoyed: "stressed",
  stressed: "stressed",
  suspicious: "suspicious",
  angry: "angry",
};

export function emotionToTtsParams(emotion: EmotionState): { emotion: AgentEmotion } {
  // High-intensity angry can escalate to panicked
  if (emotion.current === "angry" && emotion.intensity >= 0.85) {
    return { emotion: "panicked" };
  }
  return { emotion: EMOTION_TO_TTS[emotion.current] || "calm" };
}

// ---------------------------------------------------------------------------
// Map EmotionState → system prompt tone instruction
// ---------------------------------------------------------------------------

export function emotionToPromptInstruction(emotion: EmotionState): string {
  const instructions: Record<EmotionType, string> = {
    neutral: "Ton professionnel, mesure, pose.",
    pleased: "Ton chaleureux, encourageant, satisfait.",
    relieved: "Ton soulage, detendu, positif.",
    annoyed: "Phrases plus courtes, legerement impatient, ton direct.",
    stressed: "Phrases courtes, hesitant, rythme rapide.",
    suspicious: "Ton lent et mefiant, questions courtes, peu de confiance.",
    angry: "Ton sec et direct, peu de politesse, frustration perceptible.",
  };

  const base = instructions[emotion.current] || instructions.neutral;

  // Modulate by intensity
  if (emotion.intensity >= 0.8) {
    return `${base} INTENSITE FORTE — emotion tres marquee dans le ton.`;
  }
  if (emotion.intensity >= 0.5) {
    return `${base} Emotion moderee mais perceptible.`;
  }
  return base;
}
