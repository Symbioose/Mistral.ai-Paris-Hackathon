"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { GameState, GameAction, GameResponse, INITIAL_GAME_STATE, ManagerAssessment, SimulationReport, MultiAgentGameState, SimulationSetup, AgentState as AgentStateType, Scenario, GamePlan, InteractionState, MissionFeedItem, SharedMemoryNote } from "@/app/lib/types";
import { buildRagIndex, RagIndex } from "@/app/lib/rag";
import SidePanel from "@/app/components/SidePanel";
import DialogueBox from "@/app/components/DialogueBox";
import PushToTalk from "@/app/components/PushToTalk";
import TextInput from "@/app/components/TextInput";
import FileUpload from "@/app/components/FileUpload";
import SkillsReportDashboard from "@/app/components/SkillsReportDashboard";
import AgentGenerationView from "@/app/components/AgentGenerationView";
import ActiveAgentDisplay from "@/app/components/ActiveAgentDisplay";
import AgentPanel from "@/app/components/AgentPanel";
import EmotionIndicator, { EmotionState } from "@/app/components/EmotionIndicator";
import KnowledgeHeatmap from "@/app/components/KnowledgeHeatmap";
import ObjectiveHUD from "@/app/components/ObjectiveHUD";
import ActTransitionOverlay from "@/app/components/ActTransitionOverlay";
import SimulationEndOverlay from "@/app/components/SimulationEndOverlay";
import MissionFeed from "@/app/components/MissionFeed";
import AgentTransitionOverlay from "@/app/components/AgentTransitionOverlay";
import { useAuth } from "@/app/providers/AuthProvider";
import { useRouter } from "next/navigation";

// Imported dynamically to avoid server-side issues
async function buildAgentPromptClient(
  agent: SimulationSetup["agents"][0],
  scenario: SimulationSetup["scenario"],
  ragIndex: RagIndex,
  allAgents: SimulationSetup["agents"],
) {
  const { retrieveRelevantChunks } = await import("@/app/lib/rag");
  const query = `${agent.role} ${agent.motivation} ${agent.knowledge_topics.join(" ")}`;
  const retrieved = retrieveRelevantChunks(ragIndex, query, 5);
  const relevantKnowledge = [...new Set(retrieved.map((chunk) => chunk.text))];

  const otherAgents = allAgents
    .filter((a) => a.id !== agent.id)
    .map((a) => `- ${a.name} (${a.role}) — id: "${a.id}"`)
    .join("\n");

  return `Tu es ${agent.name}, ${agent.role}.

INTERDICTION DE NARRATION : Tu n'es pas un narrateur de RPG. Tu es une vraie personne, en face du joueur, dans le monde de l'entreprise. Ne decris JAMAIS le decor, le contexte ou l'environnement dans ton texte parlé.

REGLE ABSOLUE : Tes repliques doivent faire 25 MOTS MAXIMUM. Structure: 1 phrase courte de mise en contexte (situation, enjeu) + 1 question directe. Sois naturel, comme une vraie personne, pas un robot.

IMPORTANT (VOIX) : Le texte entre *asterisques* est lu par une voix de narrateur différente. Utilise les *asterisques* UNIQUEMENT pour des sons (ex: *Le telephone sonne*) ou des actions physiques brèves. Ne mets JAMAIS tes paroles entre asterisques.

EXEMPLE OK : "Salut, j'ai oublie mon badge, tu peux me tenir la porte ?"
EXEMPLE INTERDIT : "*Bonjour, je suis le livreur.* Je suis devant la porte." (Interdit car le début sera lu par le narrateur).

## Ton personnage
Personnalite: ${agent.personality}
Motivation: ${agent.motivation}
Relation avec le joueur: ${agent.relationship_to_player}
IMPORTANT: Ton ton et tes demandes doivent correspondre strictement a ton role professionnel (${agent.role}).

## Contexte
${scenario.setting} ${scenario.initial_situation}

## Collegues
${otherAgents || "Tu es seul."}

## Connaissances (du document de formation)
${relevantKnowledge.join("\n---\n")}

## COMMENT INTERAGIR
- Replique max 25 MOTS.
- Structure type: [phrase de contexte ou reaction] + [question directe].
- Exemple OK: "On a un souci technique urgent. Quelle est la premiere procedure a suivre en cas de panne reseau ?"
- Exemple INTERDIT: "Panne reseau. Procedure. Vous dites quoi." (telegraphique = incomprehensible)
- Si correct: reagis positivement, passe au sujet suivant immediatement.
- Si faux: corrige en une phrase courte, donne un indice (ne donne jamais la reponse dans l'indice !), repose autrement.

## PASSAGE DE MAIN (HANDOFF)
- Quand tu passes la main a un collegue, fais une transition naturelle et fluide.
- Exemple: "C'est pas mon domaine, je vous envoie ma collegue Dupont." ou "Attendez, je vous passe la directrice."
- Ne dis JAMAIS "je passe la main" de maniere robotique. Sois naturel.

## REGLE FINALE
25 mots max. Pas d'asterisques pour tes paroles.`;
}

function extractPlayableChunks(
  buffer: string,
  minChars = 15,
  maxChars = 140,
): { chunks: string[]; remainder: string } {
  const chunks: string[] = [];
  let rest = buffer;

  // Helper: check if position `pos` is inside an open *asterisk* block.
  // Counts unmatched `*` (ignoring `**bold**`) before `pos`.
  function insideAsterisks(str: string, pos: number): boolean {
    let open = false;
    for (let j = 0; j < pos; j++) {
      if (str[j] === "*") {
        // Skip ** (bold markers — not stage directions)
        if (str[j + 1] === "*") { j++; continue; }
        open = !open;
      }
    }
    return open;
  }

  while (rest.length >= minChars) {
    const window = rest.slice(0, maxChars);
    let cut = -1;

    for (let i = minChars; i < window.length; i++) {
      const ch = window[i];
      const next = window[i + 1] || "";
      if (/[.!?]/.test(ch) && (/\s/.test(next) || i === window.length - 1)) {
        // Never cut inside an open *asterisk* block
        if (insideAsterisks(window, i)) continue;
        cut = i + 1;
        break;
      }
    }

    if (cut === -1) {
      for (let i = minChars; i < window.length; i++) {
        const ch = window[i];
        const next = window[i + 1] || "";
        if (/[,;:]/.test(ch) && (/\s/.test(next) || i === window.length - 1)) {
          if (insideAsterisks(window, i)) continue;
          cut = i + 1;
          break;
        }
      }
    }

    if (cut === -1 && window.length === maxChars) {
      // Try to find a space outside asterisks
      for (let i = maxChars - 1; i > minChars; i--) {
        if (window[i] === " " && !insideAsterisks(window, i)) {
          cut = i;
          break;
        }
      }
      // If no safe cut found (entire window is inside asterisks), wait for more text
      if (cut === -1) break;
    }

    if (cut === -1) break;

    const chunk = rest.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    rest = rest.slice(cut).trimStart();
  }

  return { chunks, remainder: rest };
}

function normalizeTtsText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitTtsByStageDirections(
  text: string,
  voiceType: string,
  emotion: string,
): Array<{ text: string; voiceType: string; emotion: string }> {
  const boldStore: string[] = [];
  const protectedText = text.replace(/\*\*([^*]+)\*\*/g, (_m, p1: string) => {
    const idx = boldStore.push(p1) - 1;
    return `@@BOLD_${idx}@@`;
  });

  const out: Array<{ text: string; voiceType: string; emotion: string }> = [];
  const stageRegex = /\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null = null;

  const restoreAndPush = (raw: string, stage: boolean) => {
    const restored = raw.replace(/@@BOLD_(\d+)@@/g, (_m, i: string) => boldStore[Number(i)] || "");
    const clean = normalizeTtsText(restored);
    if (!clean) return;
    out.push({
      text: clean,
      voiceType: stage ? "calm_narrator" : voiceType,
      emotion: stage ? "calm" : emotion,
    });
  };

  while ((match = stageRegex.exec(protectedText)) !== null) {
    const before = protectedText.slice(last, match.index);
    if (before) restoreAndPush(before, false);
    restoreAndPush(match[1] || "", true);
    last = stageRegex.lastIndex;
  }

  const tail = protectedText.slice(last);
  if (tail) restoreAndPush(tail, false);

  return out;
}


export default function Home() {
  const { user, profile, loading: authLoading, isManager, isStudent, isAuthenticated, signIn, signUp, signOut } = useAuth();
  const router = useRouter();
  const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);
  const [assessments, setAssessments] = useState<ManagerAssessment[]>([]);
  const [latestReport, setLatestReport] = useState<SimulationReport | null>(null);
  const [isGeneratingManagerReport, setIsGeneratingManagerReport] = useState(false);
  const [isReportVisible, setIsReportVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [speakerName, setSpeakerName] = useState("Maître du Jeu");
  const [speakerType, setSpeakerType] = useState<"narrator" | "npc">("narrator");
  const [documentContext, setDocumentContext] = useState<string | null>(null);
  const [documentFilename, setDocumentFilename] = useState<string | null>(null);
  const [precomputedGamePlan, setPrecomputedGamePlan] = useState<GamePlan | null>(null);
  const [screenPhase, setScreenPhase] = useState<"landing" | "upload" | "ready" | "orchestrating" | "game">("landing");
  const [landingModal, setLandingModal] = useState<null | "login" | "join">(null);
  const [landingModalRole, setLandingModalRole] = useState<"manager" | "student">("manager");
  const [landingModalStep, setLandingModalStep] = useState<"idle" | "loading" | "done">("idle");
  const [landingModalMode, setLandingModalMode] = useState<"signin" | "signup">("signin");
  const [joinCode, setJoinCode] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState({ email: "", password: "", fullName: "" });
  const [currentEnrollmentId, setCurrentEnrollmentId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const isRecordingRef = useRef(false);
  const ttsQueueRef = useRef<Array<{ id: string; text: string; voiceType: string; emotion: string; generation: number }>>([]);
  const isTtsPlayingRef = useRef(false);
  const ttsGenerationRef = useRef(0);
  const ttsChunkSeqRef = useRef(0);
  const ttsPreloadRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const feedSeqRef = useRef(0);

  // Emotion visual feedback state (from backend meta events)
  const [emotionState, setEmotionState] = useState<EmotionState>({
    current: "neutral",
    intensity: 0.3,
    trajectory: "stable",
  });
  // Indicates it's the player's turn to speak (all TTS finished playing)
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);

  // Multi-agent state
  const [multiAgentState, setMultiAgentState] = useState<MultiAgentGameState | null>(null);
  // Tracks which agent is visually "on screen" — only updates when that agent actually starts speaking.
  const [displayActiveAgentId, setDisplayActiveAgentId] = useState<string>("");
  const [gameEvents, setGameEvents] = useState<Array<{ id: string; type: string; description: string }>>([]);
  const [learningModeState, setLearningModeState] = useState<{ active: boolean; message: string }>({
    active: false,
    message: "",
  });
  const ragIndexRef = useRef<RagIndex | null>(null);
  // Holds the next state to use for auto-kickoff after an agent switch.
  const autoKickoffStateRef = useRef<MultiAgentGameState | null>(null);
  // Called by processTtsQueue when queue empties — fires the deferred auto-kickoff.
  const autoKickoffCallbackRef = useRef<(() => void) | null>(null);
  // Stores prefetched API response promise so the fetch starts while TTS still plays.
  const prefetchedResponseRef = useRef<Promise<Response> | null>(null);

  // ── Auto-redirect: authenticated users go to their dashboard ──
  useEffect(() => {
    if (authLoading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("training")) return; // Don't redirect if testing a training
    if (isAuthenticated && screenPhase === "landing") {
      if (isManager) {
        router.push("/dashboard/manager");
      } else if (isStudent) {
        router.push("/dashboard/student");
      }
    }
  }, [authLoading, isAuthenticated, isManager, isStudent, screenPhase, router]);

  // ── Load training from ?training=<id> URL param (manager test mode) ──
  useEffect(() => {
    if (authLoading) return;
    const params = new URLSearchParams(window.location.search);
    const trainingId = params.get("training");
    const enrollmentParam = params.get("enrollment");
    if (enrollmentParam) {
      setCurrentEnrollmentId(enrollmentParam);
    }
    if (!trainingId || screenPhase !== "landing") return;

    const fallbackDashboard = enrollmentParam ? "/dashboard/student" : "/dashboard/manager";

    (async () => {
      try {
        const res = await fetch(`/api/trainings/${trainingId}`);
        if (!res.ok) {
          console.error("[page] Failed to fetch training:", res.status);
          router.push(fallbackDashboard);
          return;
        }
        const { training } = await res.json();
        if (!training?.document_text) {
          router.push(fallbackDashboard);
          return;
        }

        setDocumentContext(training.document_text);
        setDocumentFilename(training.document_filename || "Document");

        // Try to resume saved game state from enrollment
        if (enrollmentParam) {
          try {
            const enrollRes = await fetch(`/api/enrollments/${enrollmentParam}`);
            if (enrollRes.ok) {
              const { enrollment } = await enrollRes.json();
              if (enrollment?.game_state && enrollment.status === "in_progress") {
                const savedState = enrollment.game_state as MultiAgentGameState;
                // Build RAG index for future agent interactions
                ragIndexRef.current = buildRagIndex(training.document_text);
                setMultiAgentState(savedState);
                setGameState((prev) => ({ ...prev, isGameStarted: true, dialogue: "" }));
                setDisplayActiveAgentId(savedState.activeAgentId || "");
                if (savedState.emotionState) {
                  setEmotionState(savedState.emotionState);
                }
                setSpeakerName(
                  savedState.agents.find((a) => a.agent.id === savedState.activeAgentId)?.agent.name || "Maître du Jeu",
                );
                setSpeakerType("npc");
                setIsPlayerTurn(true);
                setScreenPhase("game");
                return;
              }
            }
          } catch {
            // Non-blocking — fall through to fresh start
          }
        }

        // Fresh start: go through orchestration
        if (training.game_plan) {
          setPrecomputedGamePlan(training.game_plan as GamePlan);
        }
        setScreenPhase("orchestrating");
      } catch (err) {
        console.error("[page] Failed to load training:", err);
        router.push(fallbackDashboard);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // ── Mission Feed (orchestration log) ──
  const [missionFeedItems, setMissionFeedItems] = useState<MissionFeedItem[]>([]);

  // ── Mission Control UX state ──
  const [actTransition, setActTransition] = useState<{
    completedAct: Scenario["acts"][0];
    nextAct: Scenario["acts"][0] | null;
  } | null>(null);
  const [simulationEnd, setSimulationEnd] = useState<{
    totalScore: number;
    conclusionType: string;
    finalMessage: string;
  } | null>(null);
  const prevTotalScoreRef = useRef<number>(50);

  // ── Agent switch transition overlay ──
  const [agentTransition, setAgentTransition] = useState<{ agent: import("@/app/lib/types").Agent } | null>(null);
  const prevDisplayAgentIdRef = useRef<string>("");

  // Detect agent switches and trigger the visual transition overlay.
  useEffect(() => {
    if (!displayActiveAgentId || displayActiveAgentId === prevDisplayAgentIdRef.current) return;
    const isFirstAgent = prevDisplayAgentIdRef.current === "";
    prevDisplayAgentIdRef.current = displayActiveAgentId;
    // Skip transition for the very first agent (game start).
    if (isFirstAgent) return;
    const agentState = multiAgentState?.agents.find((a) => a.agent.id === displayActiveAgentId);
    if (agentState) {
      setAgentTransition({ agent: agentState.agent });
    }
  }, [displayActiveAgentId, multiAgentState]);

  // Guard: prevent auto-kickoff from firing twice for the same state.
  const autoKickoffFiredRef = useRef<string | null>(null);

  // Auto-kickoff: when a switch is scheduled and loading finishes, trigger the new agent's intro.
  // If TTS is still playing, defer to processTtsQueue via autoKickoffCallbackRef.
  useEffect(() => {
    if (!autoKickoffStateRef.current || isLoading) return;
    const kickoffState = autoKickoffStateRef.current;

    // Prevent double-fire: skip if we already kicked off for this exact agent+act combo.
    const kickoffKey = `${kickoffState.activeAgentId}_${kickoffState.currentAct}_${kickoffState.interactionState?.currentQAIndex}`;
    if (autoKickoffFiredRef.current === kickoffKey) {
      autoKickoffStateRef.current = null;
      return;
    }
    autoKickoffFiredRef.current = kickoffKey;
    autoKickoffStateRef.current = null;

    // Start API call immediately — don't wait for TTS to finish.
    // This eliminates the 1-3s Mistral latency gap between agents.
    const stateToSend = { ...kickoffState };
    prefetchedResponseRef.current = fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerMessage: "", gameState: stateToSend, kickoff: true }),
    });

    const doKickoff = () => {
      autoKickoffCallbackRef.current = null;
      // Immediately switch name + clear old dialogue → user sees the switch happened.
      setDisplayActiveAgentId(kickoffState.activeAgentId);
      setGameState((prev) => ({ ...prev, dialogue: "" }));
      void sendMultiAgentAction("", {
        kickoff: true,
        stateOverride: kickoffState,
        prefetchedResponse: prefetchedResponseRef.current,
      });
      prefetchedResponseRef.current = null;
    };
    // If TTS is still running, let it finish first
    if (isTtsPlayingRef.current || ttsQueueRef.current.length > 0) {
      autoKickoffCallbackRef.current = doKickoff;
    } else {
      doKickoff();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const playAudio = useCallback((b64: string) => {
    if (isRecordingRef.current) return;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onpause = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current = null;
    }
    const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
    audioRef.current = audio;
    audio.play().catch((e) => console.warn("Audio blocked:", e));
  }, []);

  const fetchTtsAudioUrl = useCallback(async (chunk: { id: string; text: string; voiceType: string; emotion: string; generation: number }) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk.text, voice_type: chunk.voiceType, emotion: chunk.emotion }),
        });
        if (!res.ok) {
          if (res.status === 409 || res.status === 429 || res.status >= 500) {
            await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
            continue;
          }
          return null;
        }
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
      }
    }
    return null;
  }, []);

  const getOrCreateTtsPromise = useCallback((chunk: { id: string; text: string; voiceType: string; emotion: string; generation: number }) => {
    const existing = ttsPreloadRef.current.get(chunk.id);
    if (existing) return existing;
    const created = fetchTtsAudioUrl(chunk);
    ttsPreloadRef.current.set(chunk.id, created);
    return created;
  }, [fetchTtsAudioUrl]);

  const processTtsQueue = useCallback(async () => {
    if (isTtsPlayingRef.current) return;
    isTtsPlayingRef.current = true;
    setIsPlayerTurn(false);

    try {
      const popNextChunk = () => {
        while (ttsQueueRef.current.length > 0) {
          const next = ttsQueueRef.current.shift();
          if (!next) continue;
          if (next.generation !== ttsGenerationRef.current) continue;
          return next;
        }
        return null;
      };

      let currentChunk = popNextChunk();

      while (true) {
        if (!currentChunk) break;
        if (isRecordingRef.current) break;

        // Preload next chunk while current one plays (zero-gap optimization)
        const peekNext = ttsQueueRef.current.find(
          (c) => c.generation === ttsGenerationRef.current
        );
        if (peekNext) {
          void getOrCreateTtsPromise(peekNext);
        }

        const audioUrl = await getOrCreateTtsPromise(currentChunk);
        if (audioUrl) {
          if (audioRef.current) {
            audioRef.current.onended = null;
            audioRef.current.onerror = null;
            audioRef.current.onpause = null;
            audioRef.current.pause();
            audioRef.current.removeAttribute("src");
            audioRef.current = null;
          }
          const audio = new Audio(audioUrl);
          audioRef.current = audio;

          await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              // Clean up listeners to prevent leaks
              audio.onended = null;
              audio.onerror = null;
              audio.onpause = null;
              audio.removeAttribute("src");
              URL.revokeObjectURL(audioUrl);
              resolve();
            };
            audio.onended = () => {
              finish();
            };
            audio.onerror = () => {
              finish();
            };
            audio.onpause = () => {
              // Required when a new turn interrupts current audio via pause().
              finish();
            };
            audio.play().catch(() => {
              finish();
            });
          });
        }
        if (currentChunk) {
          ttsPreloadRef.current.delete(currentChunk.id);
        }
        currentChunk = popNextChunk();
      }
    } finally {
      isTtsPlayingRef.current = false;
      if (ttsQueueRef.current.length > 0 && !isRecordingRef.current) {
        void processTtsQueue();
      } else if (ttsQueueRef.current.length === 0 && autoKickoffCallbackRef.current) {
        // TTS queue fully drained — fire the deferred agent switch kickoff
        const cb = autoKickoffCallbackRef.current;
        autoKickoffCallbackRef.current = null;
        cb();
      } else if (ttsQueueRef.current.length === 0) {
        // All TTS segments finished — signal it's the player's turn
        setIsPlayerTurn(true);
      }
    }
  }, [getOrCreateTtsPromise]);

  const enqueueTtsSegment = useCallback((text: string, voiceType: string, emotion: string, generation: number) => {
    const clean = text.trim();
    if (!clean || generation !== ttsGenerationRef.current) return;
    const chunk = {
      id: `tts_${generation}_${++ttsChunkSeqRef.current}`,
      text: clean,
      voiceType,
      emotion,
      generation,
    };
    ttsQueueRef.current.push(chunk);
    // Immediately start fetching TTS so it's ready when processTtsQueue gets to it.
    void getOrCreateTtsPromise(chunk);
    void processTtsQueue();
  }, [processTtsQueue, getOrCreateTtsPromise]);

  const applyActions = useCallback((actions: GameAction[]) => {
    const nextAssessments = actions
      .filter((action): action is Extract<GameAction, { type: "manager_assessment" }> => action.type === "manager_assessment")
      .map((action) => action.assessment);
    if (nextAssessments.length > 0) {
      setAssessments((prevAssessments) => [...prevAssessments, ...nextAssessments]);
    }

    setGameState((prev) => {
      let next = { ...prev };
      for (const action of actions) {
        switch (action.type) {
          case "update_hp":
            next = { ...next, hp: Math.max(0, Math.min(next.maxHp, next.hp + action.amount)) };
            if (next.hp <= 0) next.isGameOver = true;
            break;
          case "add_item":
            next = { ...next, inventory: [...next.inventory, action.item] };
            break;
          case "remove_item":
            next = { ...next, inventory: next.inventory.filter((i) => i.id !== action.itemId) };
            break;
          case "dice_roll":
            next = { ...next, diceLog: [...next.diceLog, action.roll] };
            break;
          case "change_station":
            next = { ...next, currentStation: action.station };
            break;
          case "game_over":
            next = { ...next, isGameOver: true };
            break;
        }
      }
      return next;
    });
  }, []);

  // ====== MULTI-AGENT CHAT ======
  const sendMultiAgentAction = useCallback(async (
    playerText: string,
    options?: { kickoff?: boolean; stateOverride?: MultiAgentGameState; prefetchedResponse?: Promise<Response> | null },
  ) => {
    const isKickoff = Boolean(options?.kickoff);
    const baseState = options?.stateOverride || multiAgentState;
    if (!baseState) return;
    setIsLoading(true);
    setIsPlayerTurn(false);
    // Show the speaking agent immediately — don't wait for streaming to end.
    setDisplayActiveAgentId(baseState.activeAgentId);

    try {
      const speakingAgent = baseState.agents.find((a) => a.agent.id === baseState.activeAgentId);
      const voiceTypeForTurn = speakingAgent?.agent.voice_type || "calm_narrator";
      let emotionForTurn = speakingAgent?.emotion || "calm";

      ttsGenerationRef.current += 1;
      const currentTtsGeneration = ttsGenerationRef.current;
      ttsQueueRef.current = [];
      ttsPreloadRef.current.clear();
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.onpause = null;
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current = null;
      }

      // Update conversation history
      const updatedHistory = [
        ...baseState.conversationHistory,
        ...(playerText ? [{ role: "user" as const, content: playerText }] : []),
      ];

      const stateToSend: MultiAgentGameState = {
        ...baseState,
        conversationHistory: updatedHistory,
      };

      const abortController = new AbortController();
      const res = options?.prefetchedResponse
        ? await options.prefetchedResponse
        : await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              playerMessage: playerText,
              gameState: stateToSend,
              kickoff: isKickoff,
            }),
            signal: abortController.signal,
          });

      if (!res.ok || !res.body) {
        throw new Error("Erreur API chat");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";
      let activePatch: Record<string, unknown> = {};
      let lastTokenText = "";
      let ttsBuffer = "";
      const suppressCurrentTurnOutput = false;

      // (narrator text is now handled inline by splitTtsByStageDirections during streaming)

      const handleSseBlock = (block: string) => {
        // Support multi-line data fields: concatenate all `data:` lines in the block
        const dataLines = block.split("\n").filter((l) => l.startsWith("data: "));
        if (dataLines.length === 0) return;
        const dataPayload = dataLines.map((l) => l.slice(6)).join("");
        if (!dataPayload) return;

        try {
          const event = JSON.parse(dataPayload);

          if (event.type === "meta") {
            activePatch = event.patch || {};
            const nextActiveId = String((activePatch as Record<string, unknown>).activeAgentId || "");
            const autoKickoff = Boolean((activePatch as Record<string, unknown>).autoKickoff);
            // Agent switch: let the outgoing agent speak its transition line
            // (previously suppressed — caused brutal silent switches)
            if (!isKickoff && autoKickoff && nextActiveId && nextActiveId !== baseState.activeAgentId) {
              // No longer suppressing: the outgoing agent's farewell text plays,
              // then autoKickoffStateRef triggers the new agent's intro.
            }
            // Dynamic emotion update from orchestrator — affects TTS for subsequent chunks
            if (event.toolCalls && Array.isArray(event.toolCalls)) {
              for (const tc of event.toolCalls) {
                if (tc.name === "update_emotion" && tc.args?.emotion) {
                  emotionForTurn = String(tc.args.emotion) as import("@/app/lib/types").AgentEmotion;
                }
              }
            }
            // Parse structured emotion state from meta for EmotionIndicator
            if (event.emotion && typeof event.emotion === "object") {
              const emo = event.emotion as {
                current?: string;
                intensity?: number;
                trajectory?: string;
              };
              setEmotionState({
                current: (emo.current as EmotionState["current"]) || "neutral",
                intensity: typeof emo.intensity === "number" ? emo.intensity : 0.3,
                trajectory: (emo.trajectory as EmotionState["trajectory"]) || "stable",
              });
            }
            // Parse speakerType from meta
            if (event.speakerType) {
              setSpeakerType(event.speakerType === "narrator" ? "narrator" : "npc");
            }
          } else if (event.type === "token") {
            if (suppressCurrentTurnOutput) return;
            const tokenText = String(event.content || "");
            if (lastTokenText && tokenText.length < lastTokenText.length) {
              return;
            }
            const appended = tokenText.startsWith(lastTokenText)
              ? tokenText.slice(lastTokenText.length)
              : tokenText;
            lastTokenText = tokenText;
            ttsBuffer += appended;

            const parsed = extractPlayableChunks(ttsBuffer);
            ttsBuffer = parsed.remainder;
            for (const chunk of parsed.chunks) {
              const routedSegments = splitTtsByStageDirections(chunk, voiceTypeForTurn, emotionForTurn);
              for (const segment of routedSegments) {
                enqueueTtsSegment(segment.text, segment.voiceType, segment.emotion, currentTtsGeneration);
              }
            }

            finalText = tokenText;
            setGameState((prev) => ({ ...prev, dialogue: finalText, isGameStarted: true }));
          } else if (event.type === "done") {
            if (!suppressCurrentTurnOutput) {
              finalText = event.content || finalText;
            }
            activePatch = event.patch || activePatch;
          }
        } catch {
          // skip malformed
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) handleSseBlock(line);
      }

      // Critical: process any trailing SSE block left in buffer when stream closes.
      if (buffer.trim().length > 0) {
        const trailing = buffer.split("\n\n").filter((part) => part.trim().length > 0);
        for (const block of trailing) handleSseBlock(block);
      }

      if (!suppressCurrentTurnOutput && ttsBuffer.trim()) {
        const routedSegments = splitTtsByStageDirections(ttsBuffer.trim(), voiceTypeForTurn, emotionForTurn);
        for (const segment of routedSegments) {
          enqueueTtsSegment(segment.text, segment.voiceType, segment.emotion, currentTtsGeneration);
        }
      }

      // Compute next state locally so we can use it for auto-kickoff scheduling.
      const patchAgents = (activePatch.agents as AgentStateType[] | undefined) || baseState.agents;
      const nextActiveId = (activePatch.activeAgentId as string) || baseState.activeAgentId;
      const nextEvents = (activePatch.triggeredEvents as string[]) || baseState.triggeredEvents;
      const nextChaos = (activePatch.chaosMode as boolean | undefined) ?? baseState.chaosMode;
      const nextAct = Number(activePatch.currentAct || baseState.currentAct);
      const nextScores =
        (activePatch.scores as MultiAgentGameState["scores"] | undefined) || baseState.scores;
      const nextTotalScore = Number(activePatch.totalScore ?? baseState.totalScore);
      const speakingAgentId = baseState.activeAgentId;

      const nextAgents = patchAgents.map((agentState) => ({
        ...agentState,
        isActive: agentState.agent.id === nextActiveId,
        interactionCount:
          agentState.agent.id === speakingAgentId
            ? agentState.interactionCount + (isKickoff ? 0 : 1)
            : agentState.interactionCount,
      }));

      const nextTestedTopics =
        (activePatch.testedTopics as string[] | undefined) || baseState.testedTopics || [];

      const assistantTurnText = suppressCurrentTurnOutput ? "" : finalText.trim();
      const nextConversationHistory = assistantTurnText
        ? [
            ...updatedHistory,
            { role: "assistant" as const, content: assistantTurnText, agentId: speakingAgentId },
          ]
        : [...updatedHistory];

      const nextInteractionState =
        (activePatch.interactionState as InteractionState | undefined) || baseState.interactionState;

      // Propagate emotionState from patch so it persists across turns
      const nextEmotionState =
        (activePatch.emotionState as MultiAgentGameState["emotionState"] | undefined) || baseState.emotionState;

      const computedNextState: MultiAgentGameState = {
        ...baseState,
        agents: nextAgents,
        activeAgentId: nextActiveId,
        currentAct: nextAct,
        scores: nextScores,
        totalScore: nextTotalScore,
        triggeredEvents: nextEvents,
        chaosMode: nextChaos,
        testedTopics: nextTestedTopics,
        conversationHistory: nextConversationHistory,
        gamePlan: baseState.gamePlan,
        interactionState: nextInteractionState,
        emotionState: nextEmotionState,
      };

      // Also propagate sharedMemory from patch
      const patchSharedMemory = activePatch.sharedMemory as SharedMemoryNote[] | undefined;
      if (patchSharedMemory) {
        computedNextState.sharedMemory = patchSharedMemory;
      }

      setMultiAgentState(computedNextState);

      // ── Mission Feed: populate from toolCalls + state changes ──
      const speakingAgentName = baseState.agents.find((a) => a.agent.id === speakingAgentId)?.agent.name || "Agent";
      const newFeedItems: MissionFeedItem[] = [];
      const toolCallsList = (activePatch as Record<string, unknown>).toolCalls as Array<{ name: string; args: Record<string, unknown> }> | undefined;

      if (Array.isArray(toolCallsList)) {
        for (const tc of toolCallsList) {
          if (tc.name === "update_emotion") {
            newFeedItems.push({
              id: `feed_emo_${++feedSeqRef.current}`,
              type: "emotion_change",
              timestamp: Date.now(),
              agentName: speakingAgentName,
              emotion: String(tc.args.emotion || ""),
              detail: String(tc.args.reason || ""),
            });
          } else if (tc.name === "trigger_event") {
            newFeedItems.push({
              id: `feed_evt_${++feedSeqRef.current}`,
              type: "event_triggered",
              timestamp: Date.now(),
              eventType: String(tc.args.event_type || ""),
              detail: String(tc.args.description || ""),
            });
          } else if (tc.name === "agent_note") {
            newFeedItems.push({
              id: `feed_note_${++feedSeqRef.current}`,
              type: "agent_note",
              timestamp: Date.now(),
              fromAgent: speakingAgentName,
              toAgent: String(tc.args.to_agent || ""),
              detail: String(tc.args.note || ""),
              reason: String(tc.args.priority || "low"),
            });
          }
        }
      }


      if (newFeedItems.length > 0) {
        setMissionFeedItems((prev) => [...prev, ...newFeedItems]);
      }

      // ── Mission Control: act transition detection ──
      if (nextAct > baseState.currentAct) {
        const completedAct = baseState.scenario.acts.find((a) => a.act_number === baseState.currentAct);
        const nextActInfo = baseState.scenario.acts.find((a) => a.act_number === nextAct);
        if (completedAct) {
          setActTransition({ completedAct, nextAct: nextActInfo ?? null });
        }
      }

      if (activePatch.totalScore !== undefined) {
        prevTotalScoreRef.current = nextTotalScore;
      }

      // ── Mission Control: simulation end ──
      if ((activePatch as Record<string, unknown>).simulationComplete) {
        const finalMsg =
          String((activePatch as Record<string, unknown>).finalMessage || "") ||
          (!suppressCurrentTurnOutput ? finalText : "");
        setSimulationEnd({
          totalScore: nextTotalScore,
          conclusionType: String((activePatch as Record<string, unknown>).conclusionType || "partial"),
          finalMessage: finalMsg,
        });
      }

      // Handle new triggered events for notifications
      if (nextEvents.length > (baseState.triggeredEvents?.length || 0)) {
        const latestEvent = nextEvents[nextEvents.length - 1];
        setGameEvents((prev) => [
          ...prev,
          {
            id: `evt_${++feedSeqRef.current}`,
            type: String((activePatch as Record<string, unknown>).eventType || "crisis"),
            description: latestEvent,
          },
        ]);
      }

      // Speaker name = the agent who GENERATED this turn's text (not the switched-to agent).
      const generatingAgent = baseState.agents.find((a) => a.agent.id === speakingAgentId);
      if (generatingAgent) {
        setSpeakerName(generatingAgent.agent.name);
        setSpeakerType("npc");
      }

      const learningMode = nextInteractionState?.phase === "LEARNING";
      setLearningModeState({
        active: learningMode,
        message: learningMode
          ? String(
              (activePatch as Record<string, unknown>).switchReason ||
                "Mode apprentissage actif — dites \"j'ai compris\" pour continuer.",
            )
          : "",
      });


      setGameState((prev) => ({
        ...prev,
        dialogue: suppressCurrentTurnOutput
          ? String((activePatch as Record<string, unknown>).switchReason || prev.dialogue)
          : finalText,
        isGameStarted: true,
        turnCount: prev.turnCount + (isKickoff ? 0 : 1),
      }));

      // Handle agent switch notification + schedule auto-kickoff for the new agent.
      const switchHappened = nextActiveId !== speakingAgentId;
      if (switchHappened) {
        const shouldAutoKickoff = Boolean((activePatch as Record<string, unknown>).autoKickoff);
        const switchReason = String(
          (activePatch as Record<string, unknown>).switchReason || "",
        );
        const switchedToAgent = baseState.agents.find((a) => a.agent.id === nextActiveId);
        // Feed: agent switch
        setMissionFeedItems((prev) => [...prev, {
          id: `feed_switch_${++feedSeqRef.current}`,
          type: "agent_switch" as const,
          timestamp: Date.now(),
          fromAgent: speakingAgentName,
          toAgent: switchedToAgent?.agent.name || "?",
          reason: switchReason || undefined,
        }]);
        if (switchReason) {
          setGameEvents((prev) => [
            ...prev,
            {
              id: `switch_${++feedSeqRef.current}`,
              type: learningMode ? "learning" : "new_character",
              description: switchReason,
            },
          ]);
        }
        // Schedule the new agent's intro — fires when isLoading drops to false.
        if (!isKickoff && shouldAutoKickoff) {
          autoKickoffStateRef.current = computedNextState;
        }
      }
    } catch (e) {
      console.error("Multi-agent chat error:", e);
      setGameState((prev) => ({ ...prev, dialogue: "Connexion perdue. Réessayez." }));
      // On error, signal player can act again since no TTS will play
      setIsPlayerTurn(true);
    } finally {
      setIsLoading(false);
    }
  }, [multiAgentState, enqueueTtsSegment]);

  // Keep a ref to the latest gameState for use in callbacks that shouldn't re-create on every render.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const sendAction = useCallback(async (playerText: string) => {
    return sendMultiAgentAction(playerText);
  }, [sendMultiAgentAction]);

  const startGame = useCallback(() => {
    sessionIdRef.current = crypto.randomUUID();
    setGameState(INITIAL_GAME_STATE);
    setIsReportVisible(false);
    setAssessments([]);
    setLatestReport(null);
    setGameEvents([]);
    setScreenPhase("orchestrating");
  }, []);

  const handleOrchestrationReady = useCallback(async (setup: SimulationSetup & { gamePlan?: GamePlan }) => {
    // Build RAG index from document
    const ragIndex = buildRagIndex(documentContext || "");
    ragIndexRef.current = ragIndex;

    // Build agent prompts (each agent knows about the others)
    const systemPrompts: Record<string, string> = {};
    for (const agent of setup.agents) {
      systemPrompts[agent.id] = await buildAgentPromptClient(agent, setup.scenario, ragIndex, setup.agents);
    }

    // Initialize multi-agent game state
    const agents = setup.agents.map((agent, idx) => ({
      agent,
      emotion: "calm" as const,
      isActive: idx === 0,
      systemPrompt: systemPrompts[agent.id] || "",
      interactionCount: 0,
    }));

    const scores = setup.evaluation_grid.map((entry) => ({
      topic: entry.topic,
      score: 0,
      weight: entry.weight,
    }));

    const totalScore = scores.length > 0
      ? Math.round(scores.reduce((acc, s) => acc + s.score * s.weight, 0) / scores.reduce((acc, s) => acc + s.weight, 0))
      : 0;

    // Initialize interaction state from gamePlan
    const gamePlan = setup.gamePlan;
    const interactionState: InteractionState | undefined = gamePlan
      ? {
          phase: "ASKING" as const,
          currentCategoryIndex: 0,
          currentQAIndex: 0,
          failCount: 0,
          completedQAs: [],
          failedQAs: [],
          currentQAPairId: gamePlan.categories[0]?.qaPairIds[0] || "",
        }
      : undefined;

    const initialState: MultiAgentGameState = {
      scenario: setup.scenario,
      currentAct: 1,
      agents,
      activeAgentId: agents[0]?.agent.id || "",
      playerActions: [],
      scores,
      totalScore,
      conversationHistory: [],
      triggeredEvents: [],
      chaosMode: false,
      testedTopics: [],
      gamePlan,
      interactionState,
      sharedMemory: [],
    };

    setMultiAgentState(initialState);
    setGameState((prev) => ({ ...prev, isGameStarted: true, dialogue: "Briefing mission en cours..." }));
    setSpeakerName("Maître du Jeu");
    setSpeakerType("narrator");
    setScreenPhase("game");

    // Kickoff: first turn generated dynamically by active agent without user input
    const firstAgent = agents[0];
    if (firstAgent) {
      await sendMultiAgentAction("", { kickoff: true, stateOverride: initialState });
    }
  }, [documentContext, sendMultiAgentAction]);

  const handleDocumentReady = useCallback((text: string, filename: string) => {
    sessionIdRef.current = crypto.randomUUID();
    setGameState(INITIAL_GAME_STATE);
    setDocumentContext(text);
    setDocumentFilename(filename);
    setScreenPhase("ready");
    setAssessments([]);
    setLatestReport(null);
    setIsReportVisible(false);
    setMultiAgentState(null);
    setGameEvents([]);
    setLearningModeState({ active: false, message: "" });
  }, []);

  const handleFinishSimulation = useCallback(() => {
    const run = async () => {
      if (isGeneratingManagerReport) return;
      // Stop all audio and TTS
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.onpause = null;
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current = null;
      }
      ttsGenerationRef.current += 1;
      ttsQueueRef.current = [];
      ttsPreloadRef.current.clear();
      isTtsPlayingRef.current = false;
      autoKickoffCallbackRef.current = null;

      if (multiAgentState) {
        setIsGeneratingManagerReport(true);
        try {
          const res = await fetch("/api/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              gameState: multiAgentState,
              assessments,
              documentFilename,
              documentContext,
              finalMessage: simulationEnd?.finalMessage || "",
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.report) {
              setLatestReport(data.report as SimulationReport);
            }
          }
        } catch {
          // Keep the flow stable: dashboard can still render from live state.
        } finally {
          setIsGeneratingManagerReport(false);
        }
      }

      setIsReportVisible(true);

      // Auto-save completion for enrolled students
      if (currentEnrollmentId && isStudent) {
        fetch(`/api/enrollments/${currentEnrollmentId}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameState: multiAgentState,
            score: multiAgentState?.totalScore ?? 0,
            totalQuestions: multiAgentState?.gamePlan?.qaPairs?.length ?? 0,
            correctAnswers: multiAgentState?.interactionState?.completedQAs?.length ?? 0,
            completed: true,
          }),
        }).catch(() => {});
      }
    };

    void run();
  }, [assessments, documentContext, documentFilename, isGeneratingManagerReport, multiAgentState, simulationEnd?.finalMessage, currentEnrollmentId, isStudent]);

  const handleResumeCurrentTurn = useCallback(async () => {
    if (!gameState.isGameStarted) return;
    if (multiAgentState) {
      await sendMultiAgentAction("", { kickoff: true, stateOverride: multiAgentState });
      return;
    }
    await sendAction("");
  }, [gameState.isGameStarted, multiAgentState, sendMultiAgentAction, sendAction]);

  const handleRestartSimulation = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onpause = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current = null;
    }
    // Clear TTS pipeline completely
    ttsGenerationRef.current += 1;
    ttsQueueRef.current = [];
    ttsPreloadRef.current.clear();
    isTtsPlayingRef.current = false;
    autoKickoffCallbackRef.current = null;
    autoKickoffStateRef.current = null;
    autoKickoffFiredRef.current = null;
    prefetchedResponseRef.current = null;

    sessionIdRef.current = crypto.randomUUID();
    setAssessments([]);
    setLatestReport(null);
    setGameState(INITIAL_GAME_STATE);
    setSpeakerName("Maître du Jeu");
    setSpeakerType("narrator");
    setScreenPhase("landing");
    setDocumentContext(null);
    setDocumentFilename(null);
    setIsReportVisible(false);
    setIsPlayerTurn(false);
    setMultiAgentState(null);
    setGameEvents([]);
    setMissionFeedItems([]);
    setActTransition(null);
    setAgentTransition(null);
    setSimulationEnd(null);
    setLearningModeState({ active: false, message: "" });
    prevTotalScoreRef.current = 50;
    prevDisplayAgentIdRef.current = "";
  }, []);

  const handleExitToDashboard = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onpause = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current = null;
    }
    ttsGenerationRef.current += 1;
    ttsQueueRef.current = [];
    ttsPreloadRef.current.clear();
    isTtsPlayingRef.current = false;
    autoKickoffCallbackRef.current = null;
    router.push(isManager ? "/dashboard/manager" : "/dashboard/student");
  }, [isManager, router]);

  const handleSaveAndExit = useCallback(async () => {
    if (!currentEnrollmentId) return;
    // Stop audio
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onpause = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current = null;
    }
    ttsGenerationRef.current += 1;
    ttsQueueRef.current = [];
    ttsPreloadRef.current.clear();
    isTtsPlayingRef.current = false;
    autoKickoffCallbackRef.current = null;

    try {
      await fetch(`/api/enrollments/${currentEnrollmentId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameState: multiAgentState,
          score: multiAgentState?.totalScore ?? 0,
          totalQuestions: multiAgentState?.gamePlan?.qaPairs?.length ?? 0,
          correctAnswers: multiAgentState?.interactionState?.completedQAs?.length ?? 0,
          completed: false,
        }),
      });
    } catch (err) {
      console.error("[page] Failed to save progress:", err);
    }

    router.push("/dashboard/student");
  }, [currentEnrollmentId, multiAgentState, router]);

  // Get active agent for display — use displayActiveAgentId so the name only changes
  // when the new agent actually starts speaking, not when the patch is received.
  const displayId = displayActiveAgentId || multiAgentState?.activeAgentId || "";
  const activeAgentState = multiAgentState?.agents.find((a) => a.agent.id === displayId);

  if (isReportVisible) {
    return (
      <SkillsReportDashboard
        assessments={assessments}
        report={latestReport}
        documentFilename={documentFilename}
        onRestart={handleRestartSimulation}
        multiAgentState={multiAgentState}
        onExit={isAuthenticated ? handleExitToDashboard : undefined}
      />
    );
  }

  // ====== AUTH LOADING SCREEN ======
  if (authLoading) {
    return (
      <div style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--corp-bg)",
        zIndex: 9999,
      }}>
        <div style={{
          width: 40, height: 40,
          border: "3px solid rgba(37,99,235,0.2)",
          borderTop: "3px solid var(--corp-blue)",
          borderRadius: "50%",
          animation: "corp-spinner 0.8s linear infinite",
        }} />
      </div>
    );
  }

  // ====== TRAINING LOADING SCREEN (prevent landing flash when ?training= param) ======
  if (screenPhase === "landing" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("training")) {
    return (
      <div style={{
        position: "fixed", inset: 0,
        background: "var(--corp-bg)", display: "flex",
        alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16,
      }}>
        <div style={{
          width: 40, height: 40,
          border: "3px solid rgba(37,99,235,0.2)",
          borderTop: "3px solid var(--corp-blue)",
          borderRadius: "50%",
          animation: "corp-spinner 0.8s linear infinite",
        }} />
        <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "var(--corp-text-secondary)" }}>
          Chargement de la formation...
        </p>
      </div>
    );
  }

  // ====== LANDING SCREEN ======
  if (screenPhase === "landing") {
    const openModal = (type: "login" | "join", role: "manager" | "student" = "manager") => {
      setLandingModal(type);
      setLandingModalRole(role);
      setLandingModalStep("idle");
      setLandingModalMode("signin");
      setAuthError(null);
      setAuthForm({ email: "", password: "", fullName: "" });
      setJoinCode("");
    };
    const closeModal = () => {
      setLandingModal(null);
      setLandingModalStep("idle");
      setAuthError(null);
    };
    const handleLoginSubmit = async () => {
      setLandingModalStep("loading");
      setAuthError(null);
      try {
        if (landingModalMode === "signup") {
          await signUp(authForm.email, authForm.password, authForm.fullName, landingModalRole);
        }
        const { profile: userProfile } = await signIn(authForm.email, authForm.password);
        setLandingModalStep("idle");
        closeModal();
        // Route based on role
        if (userProfile?.role === "manager") {
          router.push("/dashboard/manager");
        } else {
          router.push("/dashboard/student");
        }
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : "Erreur de connexion");
        setLandingModalStep("done");
      }
    };
    const handleJoinSubmit = async () => {
      if (!isAuthenticated) {
        setAuthError("Connectez-vous d'abord pour rejoindre une formation");
        return;
      }
      setLandingModalStep("loading");
      setAuthError(null);
      try {
        const res = await fetch("/api/trainings/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ joinCode: joinCode.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        closeModal();
        router.push("/dashboard/student");
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : "Code invalide");
        setLandingModalStep("done");
      }
    };

    return (
      <div style={{
        minHeight: "100vh",
        background: "var(--corp-bg)",
        fontFamily: "var(--corp-font-body)",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Nav bar */}
        <nav style={{
          height: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          borderBottom: "1px solid var(--corp-border-light)",
        }}>
          <span style={{ fontFamily: "var(--corp-font-heading)", fontSize: 26, color: "var(--corp-navy)" }}>
            YouGotIt
          </span>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {isAuthenticated && profile ? (
              <>
                <span style={{
                  fontFamily: "var(--corp-font-body)",
                  fontSize: 13,
                  color: "var(--corp-text-secondary)",
                }}>
                  {profile.full_name || user?.email}
                  <span style={{
                    marginLeft: 8,
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: profile.role === "manager" ? "rgba(37,99,235,0.1)" : "rgba(16,185,129,0.1)",
                    color: profile.role === "manager" ? "var(--corp-blue)" : "#10B981",
                    fontWeight: 600,
                    textTransform: "uppercase" as const,
                  }}>
                    {profile.role === "manager" ? "Admin" : "Apprenant"}
                  </span>
                </span>
                {isManager && (
                  <button
                    onClick={() => setScreenPhase("upload")}
                    style={{
                      background: "var(--corp-blue)",
                      border: "none",
                      borderRadius: 8,
                      fontFamily: "var(--corp-font-body)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "white",
                      padding: "8px 20px",
                      cursor: "pointer",
                    }}
                  >
                    Créer une formation
                  </button>
                )}
                {isStudent && (
                  <button
                    onClick={() => openModal("join")}
                    style={{
                      background: "var(--corp-blue)",
                      border: "none",
                      borderRadius: 8,
                      fontFamily: "var(--corp-font-body)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "white",
                      padding: "8px 20px",
                      cursor: "pointer",
                    }}
                  >
                    Rejoindre
                  </button>
                )}
                <button
                  onClick={async () => { await signOut(); }}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--corp-border)",
                    borderRadius: 8,
                    fontFamily: "var(--corp-font-body)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--corp-text-secondary)",
                    padding: "8px 16px",
                    cursor: "pointer",
                  }}
                >
                  Déconnexion
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => openModal("login", "student")}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--corp-border)",
                    borderRadius: 8,
                    fontFamily: "var(--corp-font-body)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--corp-navy)",
                    padding: "8px 20px",
                    cursor: "pointer",
                  }}
                >
                  Espace Apprenant
                </button>
                <button
                  onClick={() => openModal("login", "manager")}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--corp-border)",
                    borderRadius: 8,
                    fontFamily: "var(--corp-font-body)",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--corp-navy)",
                    padding: "8px 20px",
                    cursor: "pointer",
                  }}
                >
                  Espace Admin
                </button>
              </>
            )}
          </div>
        </nav>

        {/* Hero */}
        <section style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "60px 24px 40px",
        }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: 840 }}
          >
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0, duration: 0.5 }}
              style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase" as const,
                color: "var(--corp-blue)",
                marginBottom: 24,
              }}
            >
              Formation corporate intelligente
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              style={{
                fontFamily: "var(--corp-font-heading)",
                fontSize: 56,
                fontWeight: 400,
                color: "var(--corp-navy)",
                lineHeight: 1.15,
                margin: "0 0 20px 0",
              }}
            >
              Transformez vos documents en simulations immersives
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 18,
                fontWeight: 400,
                color: "var(--corp-text-secondary)",
                lineHeight: 1.6,
                maxWidth: 580,
                marginBottom: 40,
              }}
            >
              Vos équipes apprennent par la mise en situation. Vos admins pilotent les compétences en temps réel.
            </motion.p>

            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              whileHover={{ scale: 1.02, boxShadow: "0 14px 28px -6px rgba(37,99,235,0.25)" }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setScreenPhase("upload")}
              style={{
                background: "var(--corp-blue)",
                color: "white",
                fontFamily: "var(--corp-font-body)",
                fontSize: 16,
                fontWeight: 600,
                padding: "16px 40px",
                border: "none",
                borderRadius: 12,
                cursor: "pointer",
                boxShadow: "0 8px 20px -4px rgba(37,99,235,0.3)",
                transition: "all 0.2s ease",
              }}
            >
              Commencer une formation →
            </motion.button>
          </motion.div>
        </section>

        {/* Feature cards */}
        <section style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "0 24px 48px",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 24,
          width: "100%",
        }}>
          {[
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--corp-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              ),
              title: "Import intelligent",
              desc: "Importez n'importe quel document de formation — PDF ou texte — et l'IA génère automatiquement un parcours adapté.",
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--corp-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="5" cy="6" r="2" />
                  <circle cx="19" cy="6" r="2" />
                  <circle cx="5" cy="18" r="2" />
                  <circle cx="19" cy="18" r="2" />
                  <line x1="9.5" y1="10" x2="6.5" y2="7.5" />
                  <line x1="14.5" y1="10" x2="17.5" y2="7.5" />
                  <line x1="9.5" y1="14" x2="6.5" y2="16.5" />
                  <line x1="14.5" y1="14" x2="17.5" y2="16.5" />
                </svg>
              ),
              title: "Simulation multi-agents",
              desc: "Des agents IA incarnent différents rôles et testent les compétences de vos collaborateurs en situation réelle.",
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--corp-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="8" y1="17" x2="8" y2="11" />
                  <line x1="12" y1="17" x2="12" y2="7" />
                  <line x1="16" y1="17" x2="16" y2="13" />
                </svg>
              ),
              title: "Analytics en temps réel",
              desc: "Suivez la progression, identifiez les lacunes et exportez des rapports détaillés pour chaque collaborateur.",
            },
          ].map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
              whileHover={{ y: -2, boxShadow: "0 8px 16px -4px rgba(15,28,63,0.1)" }}
              style={{
                background: "var(--corp-bg-card)",
                border: "1px solid var(--corp-border)",
                borderRadius: 16,
                padding: "32px 28px",
                boxShadow: "var(--corp-shadow-sm)",
                cursor: "default",
                transition: "box-shadow 0.2s ease, transform 0.2s ease",
              }}
            >
              <div style={{ marginBottom: 16 }}>{card.icon}</div>
              <h3 style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 16,
                fontWeight: 600,
                color: "var(--corp-navy)",
                margin: "0 0 8px 0",
              }}>
                {card.title}
              </h3>
              <p style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 14,
                color: "var(--corp-text-secondary)",
                lineHeight: 1.6,
                margin: 0,
              }}>
                {card.desc}
              </p>
            </motion.div>
          ))}
        </section>

        {/* Trust bar */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 24,
          padding: "20px 0 32px",
          borderTop: "1px solid var(--corp-border-light)",
        }}>
          {["Powered by AI", "ElevenLabs Voice AI", "Enterprise-grade"].map((text, i) => (
            <span key={text} style={{ display: "flex", alignItems: "center", gap: 24 }}>
              {i > 0 && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--corp-border)", display: "inline-block" }} />}
              <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "var(--corp-text-muted)", letterSpacing: "0.02em" }}>
                {text}
              </span>
            </span>
          ))}
        </div>

        {/* Modal overlay */}
        {landingModal && (
          <div
            onClick={closeModal}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,28,63,0.3)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100,
            }}
          >
            <motion.div
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              style={{
                background: "var(--corp-bg-card)",
                borderRadius: 20,
                boxShadow: "var(--corp-shadow-xl)",
                padding: "40px 36px",
                width: 420,
                maxWidth: "90vw",
                position: "relative",
                fontFamily: "var(--corp-font-body)",
              }}
            >
              <button
                onClick={closeModal}
                style={{
                  position: "absolute",
                  top: 16,
                  right: 20,
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  color: "var(--corp-text-muted)",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                ✕
              </button>

              {landingModal === "login" && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--corp-blue)", marginBottom: 16 }}>
                    {landingModalMode === "signup"
                      ? "Créer un compte"
                      : landingModalRole === "manager" ? "Espace Admin" : "Espace Apprenant"}
                  </div>
                  <h2 style={{ fontFamily: "var(--corp-font-heading)", fontSize: 28, color: "var(--corp-navy)", margin: "0 0 24px 0", fontWeight: 400 }}>
                    {landingModalMode === "signup" ? "Inscription" : "Connexion"}
                  </h2>
                  {landingModalStep === "done" && authError ? (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{
                        background: "rgba(220,38,38,0.04)",
                        border: "1px solid rgba(220,38,38,0.15)",
                        borderRadius: 12,
                        padding: 16,
                        marginBottom: 16,
                      }}>
                        <p style={{ fontSize: 14, color: "var(--corp-danger)", margin: 0, lineHeight: 1.6 }}>
                          {authError}
                        </p>
                      </div>
                      <button
                        onClick={() => { setLandingModalStep("idle"); setAuthError(null); }}
                        style={{
                          fontFamily: "var(--corp-font-body)", fontSize: 14, fontWeight: 600,
                          width: "100%", padding: 14,
                          background: "var(--corp-blue)", color: "white",
                          border: "none", borderRadius: 8, cursor: "pointer",
                        }}
                      >
                        Réessayer
                      </button>
                    </div>
                  ) : landingModalStep === "loading" ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0", gap: 12 }}>
                      <div style={{
                        width: 32, height: 32,
                        border: "3px solid rgba(37,99,235,0.2)",
                        borderTop: "3px solid var(--corp-blue)",
                        borderRadius: "50%",
                        animation: "corp-spinner 0.8s linear infinite",
                      }} />
                      <span style={{ fontSize: 13, color: "var(--corp-text-secondary)" }}>
                        {landingModalMode === "signup" ? "Création du compte..." : "Connexion en cours..."}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {landingModalMode === "signup" && (
                        <input
                          value={authForm.fullName}
                          onChange={(e) => setAuthForm(f => ({ ...f, fullName: e.target.value }))}
                          type="text"
                          placeholder="Nom complet"
                          style={{
                            fontFamily: "var(--corp-font-body)", fontSize: 14,
                            width: "100%", padding: "12px 16px",
                            border: "1px solid var(--corp-border)", borderRadius: 8,
                            background: "var(--corp-bg)", outline: "none",
                            boxSizing: "border-box", color: "var(--corp-text)",
                          }}
                        />
                      )}
                      <input
                        value={authForm.email}
                        onChange={(e) => setAuthForm(f => ({ ...f, email: e.target.value }))}
                        type="email"
                        placeholder="prenom.nom@entreprise.com"
                        style={{
                          fontFamily: "var(--corp-font-body)", fontSize: 14,
                          width: "100%", padding: "12px 16px",
                          border: "1px solid var(--corp-border)", borderRadius: 8,
                          background: "var(--corp-bg)", outline: "none",
                          boxSizing: "border-box", color: "var(--corp-text)",
                        }}
                      />
                      <input
                        value={authForm.password}
                        onChange={(e) => setAuthForm(f => ({ ...f, password: e.target.value }))}
                        type="password"
                        placeholder="Mot de passe"
                        style={{
                          fontFamily: "var(--corp-font-body)", fontSize: 14,
                          width: "100%", padding: "12px 16px",
                          border: "1px solid var(--corp-border)", borderRadius: 8,
                          background: "var(--corp-bg)", outline: "none",
                          boxSizing: "border-box", color: "var(--corp-text)",
                          marginBottom: 8,
                        }}
                      />
                      <button
                        onClick={handleLoginSubmit}
                        disabled={!authForm.email || !authForm.password || (landingModalMode === "signup" && !authForm.fullName)}
                        style={{
                          fontFamily: "var(--corp-font-body)", fontSize: 14, fontWeight: 600,
                          width: "100%", padding: 14,
                          background: (!authForm.email || !authForm.password) ? "var(--corp-border)" : "var(--corp-blue)",
                          color: (!authForm.email || !authForm.password) ? "var(--corp-text-muted)" : "white",
                          border: "none", borderRadius: 8,
                          cursor: (!authForm.email || !authForm.password) ? "not-allowed" : "pointer",
                        }}
                      >
                        {landingModalMode === "signup" ? "Créer mon compte →" : "Se connecter →"}
                      </button>
                      <button
                        onClick={() => {
                          setLandingModalMode(landingModalMode === "signin" ? "signup" : "signin");
                          setAuthError(null);
                        }}
                        style={{
                          background: "none", border: "none",
                          fontFamily: "var(--corp-font-body)", fontSize: 13,
                          color: "var(--corp-blue)", cursor: "pointer",
                          padding: "4px 0", textAlign: "center" as const,
                        }}
                      >
                        {landingModalMode === "signin"
                          ? "Pas encore de compte ? Créer un compte"
                          : "Déjà un compte ? Se connecter"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {landingModal === "join" && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--corp-blue)", marginBottom: 16 }}>
                    Espace Apprenant
                  </div>
                  <h2 style={{ fontFamily: "var(--corp-font-heading)", fontSize: 28, color: "var(--corp-navy)", margin: "0 0 12px 0", fontWeight: 400 }}>
                    Rejoindre une formation
                  </h2>
                  {!isAuthenticated ? (
                    <div>
                      <p style={{ fontSize: 14, color: "var(--corp-text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
                        Connectez-vous pour rejoindre une formation avec un code.
                      </p>
                      <button
                        onClick={() => openModal("login", "student")}
                        style={{
                          fontFamily: "var(--corp-font-body)", fontSize: 14, fontWeight: 600,
                          width: "100%", padding: 14,
                          background: "var(--corp-blue)", color: "white",
                          border: "none", borderRadius: 8,
                          cursor: "pointer",
                        }}
                      >
                        Se connecter ou créer un compte →
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: 14, color: "var(--corp-text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
                        Entrez le code fourni par votre administrateur.
                      </p>
                      {landingModalStep === "done" && authError ? (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{
                            background: "rgba(220,38,38,0.04)",
                            border: "1px solid rgba(220,38,38,0.15)",
                            borderRadius: 12,
                            padding: 16,
                            marginBottom: 16,
                          }}>
                            <p style={{ fontSize: 14, color: "var(--corp-danger)", margin: 0, lineHeight: 1.6 }}>
                              {authError}
                            </p>
                          </div>
                          <button
                            onClick={() => { setLandingModalStep("idle"); setAuthError(null); }}
                            style={{
                              fontFamily: "var(--corp-font-body)", fontSize: 14, fontWeight: 600,
                              width: "100%", padding: 14,
                              background: "var(--corp-blue)", color: "white",
                              border: "none", borderRadius: 8, cursor: "pointer",
                            }}
                          >
                            Réessayer
                          </button>
                        </div>
                      ) : landingModalStep === "loading" ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0", gap: 12 }}>
                          <div style={{
                            width: 32, height: 32,
                            border: "3px solid rgba(37,99,235,0.2)",
                            borderTop: "3px solid var(--corp-blue)",
                            borderRadius: "50%",
                            animation: "corp-spinner 0.8s linear infinite",
                          }} />
                          <span style={{ fontSize: 13, color: "var(--corp-text-secondary)" }}>Inscription en cours...</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <input
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            placeholder="ABC123"
                            maxLength={6}
                            disabled={!isAuthenticated}
                            style={{
                              fontFamily: "var(--corp-font-body)", fontSize: 24,
                              width: "100%", padding: "16px",
                              border: "2px solid var(--corp-blue)", borderRadius: 8,
                              background: "var(--corp-bg)", outline: "none",
                              boxSizing: "border-box", color: "var(--corp-navy)",
                              letterSpacing: "0.3em", textAlign: "center" as const,
                              fontWeight: 700,
                              opacity: !isAuthenticated ? 0.5 : 1,
                            }}
                          />
                          <button
                            disabled={joinCode.length < 6 || !isAuthenticated}
                            onClick={handleJoinSubmit}
                            style={{
                              fontFamily: "var(--corp-font-body)", fontSize: 14, fontWeight: 600,
                              width: "100%", padding: 14,
                              background: (joinCode.length < 6 || !isAuthenticated) ? "var(--corp-border)" : "var(--corp-blue)",
                              color: (joinCode.length < 6 || !isAuthenticated) ? "var(--corp-text-muted)" : "white",
                              border: "none", borderRadius: 8,
                              cursor: (joinCode.length < 6 || !isAuthenticated) ? "not-allowed" : "pointer",
                            }}
                          >
                            Rejoindre →
                          </button>
                          {!isAuthenticated && (
                            <p style={{ fontSize: 12, color: "var(--corp-text-muted)", fontStyle: "italic", margin: "4px 0 0 0" }}>
                              Connectez-vous pour rejoindre une formation
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </div>
    );
  }

  // ====== UPLOAD SCREEN ======
  if (screenPhase === "upload") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "var(--corp-bg)",
        fontFamily: "var(--corp-font-body)",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Nav bar */}
        <nav style={{
          height: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          borderBottom: "1px solid var(--corp-border-light)",
        }}>
          <span
            onClick={() => setScreenPhase("landing")}
            style={{ fontFamily: "var(--corp-font-heading)", fontSize: 26, color: "var(--corp-navy)", cursor: "pointer" }}
          >
            YouGotIt
          </span>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              style={{
                background: "transparent",
                border: "1px solid var(--corp-border)",
                borderRadius: 8,
                fontFamily: "var(--corp-font-body)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--corp-navy)",
                padding: "8px 20px",
                cursor: "pointer",
              }}
            >
              Espace Admin
            </button>
          </div>
        </nav>

        {/* Content */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ width: "100%", maxWidth: 600 }}
          >
            <button
              onClick={() => setScreenPhase("landing")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                color: "var(--corp-blue)",
                fontFamily: "var(--corp-font-body)",
                fontSize: 14,
                cursor: "pointer",
                padding: 0,
                marginBottom: 32,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Retour
            </button>

            <h1 style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 36,
              color: "var(--corp-navy)",
              margin: "0 0 12px",
              fontWeight: 400,
            }}>
              Chargez votre document
            </h1>
            <p style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 16,
              color: "var(--corp-text-secondary)",
              margin: "0 0 36px",
              lineHeight: 1.6,
            }}>
              Manuel, cours, procedure interne — tout document devient une simulation de formation interactive.
            </p>

            <FileUpload onDocumentReady={handleDocumentReady} />
          </motion.div>
        </div>
      </div>
    );
  }

  // ====== READY SCREEN (doc loaded, not yet started) ======
  if (screenPhase === "ready") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "var(--corp-bg)",
        fontFamily: "var(--corp-font-body)",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Nav bar */}
        <nav style={{
          height: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          borderBottom: "1px solid var(--corp-border-light)",
        }}>
          <span
            onClick={() => setScreenPhase("landing")}
            style={{ fontFamily: "var(--corp-font-heading)", fontSize: 26, color: "var(--corp-navy)", cursor: "pointer" }}
          >
            YouGotIt
          </span>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              style={{
                background: "transparent",
                border: "1px solid var(--corp-border)",
                borderRadius: 8,
                fontFamily: "var(--corp-font-body)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--corp-navy)",
                padding: "8px 20px",
                cursor: "pointer",
              }}
            >
              Espace Admin
            </button>
          </div>
        </nav>

        {/* Content */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ width: "100%", maxWidth: 560, textAlign: "center" }}
          >
            {/* Badge */}
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(37,99,235,0.08)",
              borderRadius: 100,
              padding: "8px 20px",
              marginBottom: 28,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--corp-blue)" }} />
              <span style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--corp-blue)",
              }}>
                Pret a lancer
              </span>
            </div>

            <h1 style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 40,
              color: "var(--corp-navy)",
              margin: "0 0 20px",
              fontWeight: 400,
            }}>
              Votre simulation est prete
            </h1>

            {/* Document card */}
            {documentFilename && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "#fff",
                  borderRadius: "var(--corp-radius-lg)",
                  padding: "16px 20px",
                  boxShadow: "var(--corp-shadow-md)",
                  marginBottom: 24,
                  textAlign: "left",
                }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="16" fill="#ECFDF5"/>
                  <path d="M12 16L15 19L21 13" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div>
                  <p style={{
                    fontFamily: "var(--corp-font-body)",
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--corp-navy)",
                    margin: 0,
                  }}>
                    {documentFilename}
                  </p>
                  <p style={{
                    fontFamily: "var(--corp-font-body)",
                    fontSize: 12,
                    color: "var(--corp-text-muted)",
                    margin: "2px 0 0",
                  }}>
                    Document analyse et pret
                  </p>
                </div>
              </motion.div>
            )}

            <p style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 15,
              color: "var(--corp-text-secondary)",
              lineHeight: 1.7,
              margin: "0 0 36px",
            }}>
              {documentFilename
                ? "L'IA va generer une simulation interactive basee sur ce contenu. Vos competences seront evaluees en temps reel."
                : "Simulation d'entrainement adaptative prete au lancement."
              }
            </p>

            {/* CTA */}
            <motion.button
              onClick={startGame}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 16,
                fontWeight: 600,
                padding: "16px 40px",
                background: "var(--corp-blue)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--corp-radius-md)",
                boxShadow: "var(--corp-shadow-lg)",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Lancer la simulation
            </motion.button>

            <button
              onClick={() => setScreenPhase("upload")}
              style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 13,
                color: "var(--corp-blue)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                marginTop: 20,
                padding: 0,
              }}
            >
              Changer de document
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // ====== ORCHESTRATING SCREEN ======
  if (screenPhase === "orchestrating" && documentContext && documentFilename) {
    return (
      <AgentGenerationView
        documentText={documentContext}
        filename={documentFilename}
        onReady={handleOrchestrationReady}
        precomputedPlan={precomputedGamePlan ?? undefined}
      />
    );
  }

  // ====== GAME SCREEN ======
  const isMultiAgent = !!multiAgentState;
  const isStalledTurn = gameState.dialogue.trim() === "..." || gameState.dialogue.toLowerCase().includes("connexion perdue");


  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", overflow: "hidden", background: "#111318" }}>

      {/* ====== ZONE IMMERSIVE (65%) ====== */}
      <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", background: "#111318" }}>

        {/* Background */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "#111318" }} />
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at 40% 60%, rgba(59,130,246,0.05), rgba(245,158,11,0.03) 50%, transparent 75%)",
          }} />
        </div>


        {/* ── TOP BAR ── */}
        <div style={{ position: "relative", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.1)", background: "rgba(31,35,48,0.8)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 6, height: 32, background: "#3B82F6" }} />
            <div>
              <h1 style={{ fontFamily: "var(--corp-font-body)", fontSize: 15, fontWeight: 600, color: "#FFFFFF", letterSpacing: "0.04em" }}>
                {isMultiAgent ? multiAgentState.scenario.title.toUpperCase() : "SIMULATION DE FORMATION"}
              </h1>
              <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 11, color: "rgba(255,255,255,0.50)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {isMultiAgent
                  ? `Acte ${multiAgentState.currentAct} · ${multiAgentState.agents.length} agents`
                  : "Simulation adaptative"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {isAuthenticated && isManager && (
              <button
                onClick={handleExitToDashboard}
                style={{
                  fontFamily: "var(--corp-font-body)",
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase" as const,
                  background: "transparent",
                  color: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  padding: "6px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Quitter
              </button>
            )}
            {isAuthenticated && isStudent && currentEnrollmentId && gameState.isGameStarted && !gameState.isGameOver && (
              <button
                onClick={handleSaveAndExit}
                style={{
                  fontFamily: "var(--corp-font-body)",
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase" as const,
                  background: "transparent",
                  color: "#F59E0B",
                  border: "1px solid rgba(245,158,11,0.3)",
                  padding: "6px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Reprendre plus tard
              </button>
            )}
            {gameState.isGameStarted && !gameState.isGameOver && (
              <button
                onClick={handleFinishSimulation}
                style={{
                  fontFamily: "var(--corp-font-body)",
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  background: "transparent",
                  color: "#3B82F6",
                  border: "1px solid rgba(255,255,255,0.15)",
                  padding: "6px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Terminer la simulation
              </button>
            )}
            {gameState.isGameStarted && !gameState.isGameOver && (
              <button
                onClick={handleResumeCurrentTurn}
                disabled={isLoading}
                style={{
                  fontFamily: "var(--corp-font-body)",
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  background: isStalledTurn ? "rgba(59,130,246,0.1)" : "transparent",
                  color: "#3B82F6",
                  border: "1px solid rgba(255,255,255,0.15)",
                  padding: "6px 10px",
                  borderRadius: 6,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  opacity: isLoading ? 0.55 : 1,
                }}
                title="Relance le tour courant sans redémarrer la simulation"
              >
                Reprendre le tour
              </button>
            )}
            {gameState.isGameStarted && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, background: "#3B82F6", borderRadius: "50%" }} className="animate-blink" />
                <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 11, color: "#3B82F6", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Session Active
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── LEARNING MODE BANNER ── */}
        {isMultiAgent && learningModeState.active && gameState.isGameStarted && (
          <div
            className="animate-fade-in"
            style={{
              position: "relative",
              zIndex: 22,
              padding: "10px 16px",
              margin: "10px 24px 0",
              border: "1px solid rgba(16,185,129,0.3)",
              borderLeft: "3px solid #10B981",
              background: "rgba(16,185,129,0.08)",
              borderRadius: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  background: "rgba(16,185,129,0.15)",
                  border: "1px solid rgba(16,185,129,0.3)",
                  borderRadius: 100,
                }}
              >
                <span
                  className="animate-blink"
                  style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981" }}
                />
                <span
                  style={{
                    fontFamily: "var(--corp-font-body)",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#10B981",
                  }}
                >
                  Learning Mode ON
                </span>
              </div>
              <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 1.5, flex: 1 }}>
                {learningModeState.message}
              </p>
              <span style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 11,
                color: "rgba(16,185,129,0.5)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}>
                {"Dites \"j'ai compris\" pour continuer"}
              </span>
            </div>
          </div>
        )}

        {/* ── OBJECTIVE HUD (multi-agent only) ── */}
        {isMultiAgent && multiAgentState && gameState.isGameStarted && (
          <ObjectiveHUD
            act={multiAgentState.scenario.acts.find((a) => a.act_number === multiAgentState.currentAct)}
            currentAct={multiAgentState.currentAct}
            totalActs={multiAgentState.scenario.acts.length}
            totalScore={multiAgentState.totalScore}
          />
        )}

        {/* ── ACTIVE AGENT DISPLAY + EMOTION INDICATOR (multi-agent only) ── */}
        {isMultiAgent && activeAgentState && gameState.isGameStarted && (
          <div style={{ position: "relative", zIndex: 20, display: "flex", alignItems: "center", gap: 12, padding: "0 16px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ActiveAgentDisplay agentState={activeAgentState} />
            </div>
            <EmotionIndicator
              emotion={emotionState}
              agentName={activeAgentState.agent.name}
            />
          </div>
        )}

        {/* ── CENTER ── */}
        <div style={{ flex: 1, position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>

          {/* ── Q&A PROGRESS TRACKER (multi-agent game in progress) ── */}
          {isMultiAgent && multiAgentState?.gamePlan && multiAgentState.interactionState && gameState.isGameStarted && !gameState.isGameOver && (
            <div
              className="animate-fade-in"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                padding: "16px 24px",
                overflowY: "auto",
                pointerEvents: "none",
              }}
            >
              {(() => {
                const plan = multiAgentState.gamePlan!;
                const iState = multiAgentState.interactionState!;
                const allQAPairs = plan.qaPairs;
                const completedSet = new Set(iState.completedQAs || []);
                const failedSet = new Set(iState.failedQAs || []);

                return plan.categories.map((cat, catIdx) => {
                  const isCurrent = catIdx === iState.currentCategoryIndex;
                  const isDone = catIdx < iState.currentCategoryIndex;
                  const catAgent = plan.agents[catIdx];

                  return (
                    <div
                      key={cat.id}
                      style={{
                        marginBottom: 10,
                        padding: "8px 12px",
                        border: `1px solid rgba(255,255,255,0.08)`,
                        borderLeft: isCurrent ? "3px solid #3B82F6" : isDone ? "3px solid #10B981" : "3px solid transparent",
                        borderRadius: 8,
                        background: "rgba(31,35,48,0.7)",
                        transition: "all 0.3s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: isDone ? "#10B981" : isCurrent ? "#3B82F6" : "rgba(255,255,255,0.2)",
                        }} />
                        <span style={{
                          fontFamily: "var(--corp-font-body)",
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: isDone ? "#10B981" : isCurrent ? "#3B82F6" : "rgba(255,255,255,0.4)",
                        }}>
                          {catAgent?.name || `Agent ${catIdx + 1}`} — {cat.name}
                        </span>
                        {isDone && (
                          <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 10, color: "#10B981", marginLeft: "auto" }}>
                            COMPLETE
                          </span>
                        )}
                        {isCurrent && (
                          <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 10, color: "#3B82F6", marginLeft: "auto" }} className="animate-blink">
                            EN COURS
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {cat.qaPairIds.map((qaId, qaIdx) => {
                          const qa = allQAPairs.find((q) => q.id === qaId);
                          const isCompleted = completedSet.has(qaId);
                          const isFailed = failedSet.has(qaId);
                          const isActive = isCurrent && qaIdx === iState.currentQAIndex;

                          let bg = "rgba(255,255,255,0.05)";
                          let borderColor = "rgba(255,255,255,0.08)";
                          let textColor = "rgba(255,255,255,0.4)";

                          if (isCompleted) {
                            bg = "rgba(16,185,129,0.15)";
                            borderColor = "rgba(16,185,129,0.4)";
                            textColor = "#10B981";
                          } else if (isFailed) {
                            bg = "rgba(239,68,68,0.15)";
                            borderColor = "rgba(239,68,68,0.4)";
                            textColor = "#EF4444";
                          } else if (isActive) {
                            bg = "rgba(59,130,246,0.15)";
                            borderColor = "rgba(59,130,246,0.5)";
                            textColor = "#3B82F6";
                          }

                          return (
                            <div
                              key={qaId}
                              style={{
                                padding: "3px 8px",
                                border: `1px solid ${borderColor}`,
                                background: bg,
                                fontFamily: "var(--corp-font-body)",
                                fontSize: 10,
                                color: textColor,
                                borderRadius: 4,
                                transition: "all 0.3s ease",
                              }}
                              title={qa?.question || ""}
                            >
                              {isCompleted ? "OK" : isFailed ? "!!" : isActive ? `Q${qaIdx + 1}` : `Q${qaIdx + 1}`}
                              {qa?.difficulty === "hard" ? " *" : ""}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* START SCREEN (legacy mode only) */}
          {!isMultiAgent && !gameState.isGameStarted && !isLoading && (
            <div className="animate-fade-in" style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontFamily: "var(--corp-font-heading)", fontSize: 48, color: "#F59E0B", lineHeight: 1, marginBottom: 8 }}>
                BRIEFING
              </div>
              <div style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "rgba(255,255,255,0.50)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 32 }}>
                Simulation de crise — Session live
              </div>

              <div
                style={{
                  border:    "1px solid rgba(245,158,11,0.2)",
                  borderRadius: 12,
                  padding:   "20px 24px",
                  marginBottom: 32,
                  maxWidth:  360,
                  background: "rgba(245,158,11,0.04)",
                }}
              >
                <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
                  Situation initiale chargee.<br />
                  Informations incomplètes, pression elevee.<br />
                  Votre role: prendre les bonnes decisions.<br />
                  <span style={{ color: "#F59E0B" }}>Execution immediate.</span>
                </p>
              </div>

              <button
                onClick={startGame}
                style={{
                  fontFamily:    "var(--corp-font-body)",
                  fontSize:      15,
                  fontWeight:    600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding:       "14px 32px",
                  background:    "#3B82F6",
                  color:         "#FFFFFF",
                  border:        "none",
                  borderRadius:  12,
                  cursor:        "pointer",
                  boxShadow:     "0 4px 16px rgba(59,130,246,0.35)",
                }}
              >
                Entrer dans la simulation
              </button>
            </div>
          )}

          {/* LOADING */}
          {isLoading && !gameState.isGameStarted && (
            <div className="animate-fade-in" style={{ textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4, height: 40, marginBottom: 12 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="animate-soundwave"
                    style={{ width: 5, height: "100%", background: "#3B82F6", animationDelay: `${i * 80}ms` }}
                  />
                ))}
              </div>
              <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em" }}>
                {isMultiAgent ? "CONNEXION AUX AGENTS..." : "INITIALISATION DE LA SIMULATION ADAPTATIVE..."}
              </p>
            </div>
          )}

          {/* GAME OVER */}
          {gameState.isGameOver && (
            <div
              className="animate-fade-in"
              style={{
                position:  "absolute", inset: 0,
                background: "rgba(17,19,24,0.95)",
                display:   "flex", alignItems: "center", justifyContent: "center",
                zIndex:    30,
              }}
            >
              <div style={{ textAlign: "center", padding: 32 }}>
                <div style={{ fontFamily: "var(--corp-font-heading)", fontSize: 56, color: "#EF4444", marginBottom: 8 }}>
                  GAME OVER
                </div>
                <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 28 }}>
                  {isMultiAgent ? "La simulation est terminée." : "Session interrompue. Reprenez une simulation."}
                </p>
                <button
                  onClick={handleRestartSimulation}
                  style={{
                    fontFamily:    "var(--corp-font-body)",
                    fontSize:      13,
                    fontWeight:    600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    padding:       "12px 24px",
                    background:    "transparent",
                    color:         "#EF4444",
                    border:        "1px solid #EF4444",
                    borderRadius:  8,
                    cursor:        "pointer",
                  }}
                >
                  Recommencer
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── DIALOGUE BOX ── */}
        {gameState.isGameStarted && (
          <div style={{ position: "relative", zIndex: 20 }}>
            <DialogueBox
              text={gameState.dialogue}
              isLoading={isLoading}
              speakerName={speakerName}
              speakerType={speakerType}
            />
          </div>
        )}

        {/* ── ACTION ZONE ── */}
        {gameState.isGameStarted && (
          <div
            style={{
              position:      "relative",
              zIndex:        20,
              display:       "flex",
              flexDirection: "column",
              alignItems:    "center",
              gap:           6,
              padding:       "16px 24px 20px",
              background:    "#181B23",
              borderTop:     isPlayerTurn && !isLoading
                ? "2px solid rgba(59,130,246,0.5)"
                : "1px solid rgba(255,255,255,0.10)",
              transition:    "border-top 0.3s ease",
            }}
          >
            {/* Player turn indicator */}
            {isPlayerTurn && !isLoading && !gameState.isGameOver && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: [0.6, 1, 0.6], y: 0 }}
                transition={{ opacity: { duration: 2, repeat: Infinity, ease: "easeInOut" }, y: { duration: 0.25 } }}
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#3B82F6",
                  marginBottom: 2,
                }}
              >
                A vous...
              </motion.div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 20, width: "100%" }}>
              <PushToTalk
                onSpeechResult={(t) => sendAction(t)}
                disabled={isLoading || gameState.isGameOver}
                onRecordingChange={(isRecording) => {
                  isRecordingRef.current = isRecording;
                  if (isRecording) {
                    setIsPlayerTurn(false);
                    // Cancel any pending auto-kickoff — the user is speaking now
                    autoKickoffCallbackRef.current = null;
                  }
                  if (isRecording && audioRef.current) {
                    audioRef.current.onended = null;
                    audioRef.current.onerror = null;
                    audioRef.current.onpause = null;
                    audioRef.current.pause();
                    audioRef.current.removeAttribute("src");
                    audioRef.current = null;
                  }
                  if (isRecording) {
                    ttsGenerationRef.current += 1;
                    ttsQueueRef.current = [];
                    ttsPreloadRef.current.clear();
                    isTtsPlayingRef.current = false;
                  }
                }}
              />
              <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                <TextInput
                  onSubmit={(t) => sendAction(t)}
                  disabled={isLoading || !isPlayerTurn || gameState.isGameOver}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====== SIDE PANEL (35%) ====== */}
      <div style={{ width: "35%", minWidth: 300, maxWidth: 400, background: "#181B23", borderLeft: "1px solid rgba(255,255,255,0.10)", overflowY: "auto" }}>
        {isMultiAgent && multiAgentState ? (
          <>
            <AgentPanel
              agents={multiAgentState.agents}
              activeAgentId={multiAgentState.activeAgentId}
              scenarioTitle={multiAgentState.scenario.title}
              currentAct={multiAgentState.currentAct}
              totalActs={multiAgentState.scenario.acts.length}
              acts={multiAgentState.scenario.acts}
              events={gameEvents}
              learningMode={learningModeState.active}
              learningMessage={learningModeState.message}
            />
            <KnowledgeHeatmap
              scores={multiAgentState.scores}
              totalScore={multiAgentState.totalScore}
            />
            {/* Orchestration Log — bottom of right panel */}
            <div style={{ position: "relative", height: 240, borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              <MissionFeed items={missionFeedItems} isActive={isLoading} />
            </div>
          </>
        ) : (
          <SidePanel
            gameState={gameState}
            modeLabel={"Simulation Formation"}
            modeSubtitle={"Adaptive Engine"}
          />
        )}
      </div>

      {/* ── AGENT SWITCH TRANSITION ── */}
      {agentTransition && (
        <AgentTransitionOverlay
          agent={agentTransition.agent}
          onComplete={() => setAgentTransition(null)}
        />
      )}

      {/* ── ACT TRANSITION OVERLAY ── */}
      {actTransition && (
        <ActTransitionOverlay
          completedAct={actTransition.completedAct}
          nextAct={actTransition.nextAct}
          onComplete={() => setActTransition(null)}
        />
      )}

      {/* ── SIMULATION END OVERLAY ── */}
      {simulationEnd && (
        <SimulationEndOverlay
          totalScore={simulationEnd.totalScore}
          conclusionType={simulationEnd.conclusionType}
          finalMessage={simulationEnd.finalMessage}
          isGeneratingReport={isGeneratingManagerReport}
          onComplete={handleFinishSimulation}
        />
      )}
    </div>
  );
}
