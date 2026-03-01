"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import KnowledgeHeatmap from "@/app/components/KnowledgeHeatmap";
import ObjectiveHUD from "@/app/components/ObjectiveHUD";
import ActTransitionOverlay from "@/app/components/ActTransitionOverlay";
import SimulationEndOverlay from "@/app/components/SimulationEndOverlay";
import MissionFeed from "@/app/components/MissionFeed";

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
- Si faux: corrige en une phrase courte, donne un indice, repose autrement.

## PASSAGE DE MAIN (HANDOFF)
- Quand tu passes la main a un collegue, fais une transition naturelle et fluide.
- Exemple: "C'est pas mon domaine, je vous envoie ma collegue Dupont." ou "Attendez, je vous passe la directrice."
- Ne dis JAMAIS "je passe la main" de maniere robotique. Sois naturel.

## REGLE FINALE
25 mots max. Pas d'asterisques pour tes paroles.`;
}

function extractPlayableChunks(
  buffer: string,
  minChars = 30,
  maxChars = 140,
): { chunks: string[]; remainder: string } {
  const chunks: string[] = [];
  let rest = buffer;

  while (rest.length >= minChars) {
    const window = rest.slice(0, maxChars);
    let cut = -1;

    for (let i = minChars; i < window.length; i++) {
      const ch = window[i];
      const next = window[i + 1] || "";
      if (/[.!?]/.test(ch) && (/\s/.test(next) || i === window.length - 1)) {
        cut = i + 1;
      }
    }

    if (cut === -1) {
      for (let i = minChars; i < window.length; i++) {
        const ch = window[i];
        const next = window[i + 1] || "";
        if (/[,;:]/.test(ch) && (/\s/.test(next) || i === window.length - 1)) {
          cut = i + 1;
        }
      }
    }

    if (cut === -1 && window.length === maxChars) {
      const spaceIdx = window.lastIndexOf(" ");
      cut = spaceIdx > minChars ? spaceIdx : maxChars;
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
  const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);
  const [assessments, setAssessments] = useState<ManagerAssessment[]>([]);
  const [latestReport, setLatestReport] = useState<SimulationReport | null>(null);
  const [isGeneratingManagerReport, setIsGeneratingManagerReport] = useState(false);
  const [isReportVisible, setIsReportVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [speakerName, setSpeakerName] = useState("Maître du Jeu");
  const [speakerType, setSpeakerType] = useState<"narrator" | "npc">("narrator");
  const [hasMic, setHasMic] = useState(true);
  const [documentContext, setDocumentContext] = useState<string | null>(null);
  const [documentFilename, setDocumentFilename] = useState<string | null>(null);
  const [screenPhase, setScreenPhase] = useState<"upload" | "ready" | "orchestrating" | "game">("upload");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const isRecordingRef = useRef(false);
  const ttsQueueRef = useRef<Array<{ id: string; text: string; voiceType: string; emotion: string; generation: number }>>([]);
  const isTtsPlayingRef = useRef(false);
  const ttsGenerationRef = useRef(0);
  const ttsChunkSeqRef = useRef(0);
  const ttsPreloadRef = useRef<Map<string, Promise<string | null>>>(new Map());

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

  useEffect(() => {
    const has = typeof window !== "undefined"
      && (!!window.SpeechRecognition || !!(window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
    setHasMic(has);
  }, []);

  // Auto-kickoff: when a switch is scheduled and loading finishes, trigger the new agent's intro.
  // If TTS is still playing, defer to processTtsQueue via autoKickoffCallbackRef.
  useEffect(() => {
    if (!autoKickoffStateRef.current || isLoading) return;
    const kickoffState = autoKickoffStateRef.current;
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
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
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

        const audioUrl = await getOrCreateTtsPromise(currentChunk);
        if (audioUrl) {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
          }
          const audio = new Audio(audioUrl);
          audioRef.current = audio;

          await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
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
        audioRef.current.pause();
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

      const handleSseBlock = (block: string) => {
        const dataMatch = block.match(/^data: (.+)$/m);
        if (!dataMatch) return;

        try {
          const event = JSON.parse(dataMatch[1]);

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
              id: `feed_emo_${Date.now()}`,
              type: "emotion_change",
              timestamp: Date.now(),
              agentName: speakingAgentName,
              emotion: String(tc.args.emotion || ""),
              detail: String(tc.args.reason || ""),
            });
          } else if (tc.name === "trigger_event") {
            newFeedItems.push({
              id: `feed_evt_${Date.now()}`,
              type: "event_triggered",
              timestamp: Date.now(),
              eventType: String(tc.args.event_type || ""),
              detail: String(tc.args.description || ""),
            });
          } else if (tc.name === "agent_note") {
            newFeedItems.push({
              id: `feed_note_${Date.now()}`,
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
            id: `evt_${Date.now()}`,
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
          id: `feed_switch_${Date.now()}`,
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
              id: `switch_${Date.now()}`,
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
    } finally {
      setIsLoading(false);
    }
  }, [multiAgentState, enqueueTtsSegment]);

  // ====== LEGACY SINGLE-AGENT GAME ======
  const sendAction = useCallback(async (playerText: string) => {
    // If in multi-agent mode, delegate
    if (multiAgentState) {
      return sendMultiAgentAction(playerText);
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerText,
          turnCount: gameState.turnCount,
          gameState: { hp: gameState.hp, maxHp: gameState.maxHp, currentStation: gameState.currentStation, inventory: gameState.inventory },
          sessionId: sessionIdRef.current,
          documentContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.narrative || "Erreur API game");
      }
      const typedData = data as GameResponse;

      applyActions(typedData.actions || []);
      setLatestReport(typedData.report || null);
      setSpeakerName(typedData.speakerName || "Maître du Jeu");
      setSpeakerType(typedData.speakerType || "narrator");
      setGameState((prev) => ({ ...prev, dialogue: typedData.narrative, turnCount: prev.turnCount + 1, isGameStarted: true }));
      setScreenPhase("game");

      if (typedData.audioBase64) playAudio(typedData.audioBase64);
    } catch (e) {
      console.error("API error:", e);
      setGameState((prev) => ({ ...prev, dialogue: "Signal perdu dans les tunnels. Réessayez." }));
    } finally {
      setIsLoading(false);
    }
  }, [multiAgentState, sendMultiAgentAction, gameState.turnCount, gameState.hp, gameState.maxHp, gameState.currentStation, gameState.inventory, documentContext, applyActions, playAudio]);

  const startGame = useCallback(() => {
    sessionIdRef.current = crypto.randomUUID();
    setGameState(INITIAL_GAME_STATE);
    setIsReportVisible(false);
    setAssessments([]);
    setLatestReport(null);
    setGameEvents([]);

    if (documentContext) {
      // Document mode → go to orchestration
      setScreenPhase("orchestrating");
    } else {
      // Fallback mode → legacy single-agent
      setMultiAgentState(null);
      setScreenPhase("game");
      // We need to trigger sendAction after state updates
      setTimeout(() => {
        fetch("/api/game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerText: "",
            turnCount: 0,
            gameState: { hp: 100, maxHp: 100, currentStation: "Châtelet-Les Halles", inventory: INITIAL_GAME_STATE.inventory },
            sessionId: sessionIdRef.current,
            documentContext: null,
          }),
        })
          .then((res) => res.json())
          .then((data: GameResponse) => {
            applyActions(data.actions || []);
            setSpeakerName(data.speakerName || "Maître du Jeu");
            setSpeakerType(data.speakerType || "narrator");
            setGameState((prev) => ({ ...prev, dialogue: data.narrative, turnCount: 1, isGameStarted: true }));
            if (data.audioBase64) playAudio(data.audioBase64);
          })
          .catch((e) => {
            console.error("Init error:", e);
            setGameState((prev) => ({ ...prev, dialogue: "Signal perdu dans les tunnels. Réessayez." }));
          });
      }, 0);
    }
  }, [documentContext, applyActions, playAudio]);

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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

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
    };

    void run();
  }, [assessments, documentContext, documentFilename, isGeneratingManagerReport, multiAgentState, simulationEnd?.finalMessage]);

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
      audioRef.current.pause();
      audioRef.current = null;
    }
    sessionIdRef.current = crypto.randomUUID();
    setAssessments([]);
    setLatestReport(null);
    setGameState(INITIAL_GAME_STATE);
    setSpeakerName("Maître du Jeu");
    setSpeakerType("narrator");
    setScreenPhase("upload");
    setDocumentContext(null);
    setDocumentFilename(null);
    setIsReportVisible(false);
    setMultiAgentState(null);
    setGameEvents([]);
    setMissionFeedItems([]);
    setActTransition(null);
    setSimulationEnd(null);
    prevTotalScoreRef.current = 50;
  }, []);

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
      />
    );
  }

  // ====== UPLOAD SCREEN ======
  if (screenPhase === "upload") {
    return (
      <div style={{ height: "100vh", width: "100vw", display: "flex", background: "#F3F0E6", overflow: "hidden" }}>
        {/* Left — branding */}
        <div
          style={{
            width: "42%",
            background: "#1A1A1A",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 40px",
            borderRight: "4px solid #FF5B22",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
              <div style={{ width: 6, height: 40, background: "#FF5B22" }} />
              <div>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#5A5A5A", letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 4 }}>
                  Powered by Mistral AI
                </p>
                <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, color: "#F3F0E6", letterSpacing: "0.04em" }}>
                  RAG to RPG
                </h1>
              </div>
            </div>

            <div style={{ fontFamily: "'VT323', monospace", fontSize: 42, color: "#FF5B22", lineHeight: 1.1, marginBottom: 24 }}>
              SERIOUS<br />GAME<br />ENGINE
            </div>

            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#C4C0B5", lineHeight: 1.8, maxWidth: 300 }}>
              Uploadez n&apos;importe quel document. Notre IA le transforme en jeu de survie vocal immersif pour tester vos connaissances.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { icon: "📄", label: "Upload de votre document" },
              { icon: "🧠", label: "Mistral analyse le contenu" },
              { icon: "🎮", label: "Jeu de rôle vocal généré" },
              { icon: "🎙️", label: "ElevenLabs voix immersive" },
            ].map((step) => (
              <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 14 }}>{step.icon}</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#5A5A5A", letterSpacing: "0.05em" }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — upload zone */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 40px",
          }}
        >
          <div style={{ width: "100%", maxWidth: 520, marginBottom: 32 }}>
            <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: "#1A1A1A", letterSpacing: "0.1em", marginBottom: 6 }}>
              Chargez votre document
            </h2>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#5A5A5A", marginBottom: 28 }}>
              Manuel, cours, procedure, contrat — tout document devient un serious game.
            </p>

            <FileUpload onDocumentReady={handleDocumentReady} />
          </div>

        </div>
      </div>
    );
  }

  // ====== READY SCREEN (doc loaded, not yet started) ======
  if (screenPhase === "ready") {
    return (
      <div style={{ height: "100vh", width: "100vw", display: "flex", background: "#F3F0E6", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 52, color: "#FF5B22", marginBottom: 12 }}>
              PRET
            </div>
            {documentFilename ? (
              <>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#5A5A5A", marginBottom: 8 }}>
                  Document charge :
                </p>
                <div style={{ border: "2px solid #1A1A1A", padding: "10px 20px", boxShadow: "3px 3px 0 #1A1A1A", marginBottom: 32, background: "#FAFAF7" }}>
                  <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>
                    {documentFilename}
                  </p>
                </div>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#5A5A5A", marginBottom: 32, lineHeight: 1.7 }}>
                  Mistral va generer un jeu de survie base sur ce contenu. Vos connaissances seront testees en situation de crise.
                </p>
              </>
            ) : (
              <>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#5A5A5A", marginBottom: 32, lineHeight: 1.7 }}>
                  Simulation entrainement adaptative prete au lancement.
                </p>
              </>
            )}
            <button
              onClick={startGame}
              style={{
                fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em",
                textTransform: "uppercase", padding: "16px 40px", background: "#FF5B22", color: "#F3F0E6",
                border: "3px solid #FF5B22", boxShadow: "5px 5px 0 #CC4919", cursor: "pointer", width: "100%",
              }}
            >
              Lancer la session
            </button>
            <button
              onClick={() => setScreenPhase("upload")}
              style={{
                fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#5A5A5A",
                background: "transparent", border: "none", cursor: "pointer",
                textDecoration: "underline", marginTop: 16, letterSpacing: "0.1em",
              }}
            >
              Retour — changer de document
            </button>
          </div>
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
      />
    );
  }

  // ====== GAME SCREEN ======
  const isMultiAgent = !!multiAgentState;
  const isStalledTurn = gameState.dialogue.trim() === "..." || gameState.dialogue.toLowerCase().includes("connexion perdue");

  // Dynamic emotion background for multi-agent mode
  const EMOTION_BG_COLOR: Record<string, string> = {
    calm:       "rgba(74,144,217,0.05)",
    stressed:   "rgba(217,168,74,0.07)",
    angry:      "rgba(204,42,42,0.09)",
    panicked:   "rgba(204,42,42,0.14)",
    suspicious: "rgba(155,89,182,0.08)",
  };
  const activeEmotion = activeAgentState?.emotion || "calm";
  const emotionBgColor = isMultiAgent
    ? (EMOTION_BG_COLOR[activeEmotion] ?? EMOTION_BG_COLOR.calm)
    : "rgba(255,91,34,0.04)";

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", overflow: "hidden", background: "#F3F0E6" }}>

      {/* ====== ZONE IMMERSIVE (65%) ====== */}
      <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", background: "#1A1A1A" }}>

        {/* Background */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: isMultiAgent
            ? "linear-gradient(160deg, #0a0a0f 0%, #0f0f1a 40%, #0a0a0f 100%)"
            : "linear-gradient(160deg, #0F0F0F 0%, #1A1A1A 40%, #0A0D0A 100%)" }} />
          <div style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at 40% 60%, ${emotionBgColor} 0%, transparent 65%)`,
            transition: "background 0.8s ease",
          }} />
          {!isMultiAgent && (
            <div style={{ position: "absolute", inset: 0, opacity: 0.035, backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 120px, rgba(255,240,230,0.8) 120px, rgba(255,240,230,0.8) 122px)" }} />
          )}
          <div className="animate-scanline" style={{
            position: "absolute", left: 0, right: 0, top: 0, height: 3,
            background: isMultiAgent ? emotionBgColor.replace(/[\d.]+\)$/, "0.18)") : "rgba(255,91,34,0.06)",
            transition: "background 0.8s ease",
          }} />
          <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 120px 50px rgba(0,0,0,0.7)" }} />
        </div>


        {/* ── TOP BAR ── */}
        <div style={{ position: "relative", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: isMultiAgent ? "2px solid rgba(74,144,217,0.15)" : "2px solid rgba(255,91,34,0.15)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 6, height: 32, background: isMultiAgent ? "#4A90D9" : "#FF5B22" }} />
            <div>
              <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: "#F3F0E6", letterSpacing: "0.06em" }}>
                {isMultiAgent ? multiAgentState.scenario.title.toUpperCase() : "SIMULATION DE FORMATION"}
              </h1>
              <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#5A5A5A", letterSpacing: "0.2em", textTransform: "uppercase" }}>
                {isMultiAgent
                  ? `Acte ${multiAgentState.currentAct} · ${multiAgentState.agents.length} agents · Mistral AI`
                  : "Simulation adaptative · Mistral AI"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {gameState.isGameStarted && !gameState.isGameOver && (
              <button
                onClick={handleFinishSimulation}
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  background: "transparent",
                  color: isMultiAgent ? "#4A90D9" : "#FF5B22",
                  border: `1px solid ${isMultiAgent ? "#4A90D9" : "#FF5B22"}`,
                  padding: "6px 10px",
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
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  background: isStalledTurn ? (isMultiAgent ? "rgba(74,144,217,0.14)" : "rgba(255,91,34,0.14)") : "transparent",
                  color: isMultiAgent ? "#4A90D9" : "#FF5B22",
                  border: `1px solid ${isMultiAgent ? "#4A90D9" : "#FF5B22"}`,
                  padding: "6px 10px",
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
                <div style={{ width: 6, height: 6, background: isMultiAgent ? "#4A90D9" : "#FF5B22" }} className="animate-blink" />
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: isMultiAgent ? "#4A90D9" : "#FF5B22", letterSpacing: "0.18em", textTransform: "uppercase" }}>
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
              border: "2px solid rgba(122,182,72,0.5)",
              background: "rgba(122,182,72,0.08)",
              boxShadow: "0 0 24px rgba(122,182,72,0.2), inset 0 0 30px rgba(122,182,72,0.05)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  background: "rgba(122,182,72,0.2)",
                  border: "1px solid rgba(122,182,72,0.5)",
                }}
              >
                <span
                  className="animate-blink"
                  style={{ width: 7, height: 7, borderRadius: "50%", background: "#7AB648", boxShadow: "0 0 10px #7AB648" }}
                />
                <span
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: "#9CD56A",
                  }}
                >
                  Learning Mode ON
                </span>
              </div>
              <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.72)", lineHeight: 1.5, flex: 1 }}>
                {learningModeState.message}
              </p>
              <span style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 8,
                color: "rgba(122,182,72,0.6)",
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

        {/* ── ACTIVE AGENT DISPLAY (multi-agent only) ── */}
        {isMultiAgent && activeAgentState && gameState.isGameStarted && (
          <div style={{ position: "relative", zIndex: 20 }}>
            <ActiveAgentDisplay agentState={activeAgentState} />
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
                        border: `1px solid ${isCurrent ? "rgba(74,144,217,0.4)" : isDone ? "rgba(122,182,72,0.25)" : "rgba(255,255,255,0.06)"}`,
                        background: isCurrent ? "rgba(74,144,217,0.06)" : isDone ? "rgba(122,182,72,0.04)" : "rgba(255,255,255,0.02)",
                        transition: "all 0.3s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: isDone ? "#7AB648" : isCurrent ? "#4A90D9" : "#3A3A3A",
                          boxShadow: isCurrent ? "0 0 8px #4A90D9" : isDone ? "0 0 6px #7AB648" : "none",
                        }} />
                        <span style={{
                          fontFamily: "'Space Mono', monospace",
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: isDone ? "#7AB648" : isCurrent ? "#4A90D9" : "#5A5A5A",
                        }}>
                          {catAgent?.name || `Agent ${catIdx + 1}`} — {cat.name}
                        </span>
                        {isDone && (
                          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#7AB648", marginLeft: "auto" }}>
                            COMPLETE
                          </span>
                        )}
                        {isCurrent && (
                          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#4A90D9", marginLeft: "auto" }} className="animate-blink">
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
                          let textColor = "#5A5A5A";

                          if (isCompleted) {
                            bg = "rgba(122,182,72,0.15)";
                            borderColor = "rgba(122,182,72,0.4)";
                            textColor = "#9CD56A";
                          } else if (isFailed) {
                            bg = "rgba(204,42,42,0.15)";
                            borderColor = "rgba(204,42,42,0.4)";
                            textColor = "#CC2A2A";
                          } else if (isActive) {
                            bg = "rgba(74,144,217,0.12)";
                            borderColor = "rgba(74,144,217,0.5)";
                            textColor = "#4A90D9";
                          }

                          return (
                            <div
                              key={qaId}
                              style={{
                                padding: "3px 8px",
                                border: `1px solid ${borderColor}`,
                                background: bg,
                                fontFamily: "'Space Mono', monospace",
                                fontSize: 8,
                                color: textColor,
                                letterSpacing: "0.05em",
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
              <div style={{ fontFamily: "'VT323', monospace", fontSize: 64, color: "#FF5B22", lineHeight: 1, marginBottom: 8 }}>
                BRIEFING
              </div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#5A5A5A", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 32 }}>
                Simulation de crise — Session live
              </div>

              <div
                style={{
                  border:    "2px solid rgba(255,91,34,0.3)",
                  padding:   "20px 24px",
                  marginBottom: 32,
                  maxWidth:  360,
                  background: "rgba(255,91,34,0.04)",
                }}
              >
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#C4C0B5", lineHeight: 1.7 }}>
                  Situation initiale chargee.<br />
                  Informations incomplètes, pression elevee.<br />
                  Votre role: prendre les bonnes decisions.<br />
                  <span style={{ color: "#FF5B22" }}>Execution immediate.</span>
                </p>
              </div>

              <button
                onClick={startGame}
                style={{
                  fontFamily:    "'Space Mono', monospace",
                  fontSize:      12,
                  fontWeight:    700,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  padding:       "14px 32px",
                  background:    "#FF5B22",
                  color:         "#F3F0E6",
                  border:        "2px solid #FF5B22",
                  boxShadow:     "4px 4px 0 #CC4919",
                  cursor:        "pointer",
                  transition:    "all 0.1s",
                }}
                onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.boxShadow = "2px 2px 0 #CC4919"; (e.target as HTMLButtonElement).style.transform = "translate(2px,2px)"; }}
                onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.boxShadow = "4px 4px 0 #CC4919"; (e.target as HTMLButtonElement).style.transform = "translate(0,0)"; }}
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
                    style={{ width: 5, height: "100%", background: isMultiAgent ? "#4A90D9" : "#FF5B22", animationDelay: `${i * 80}ms` }}
                  />
                ))}
              </div>
              <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#5A5A5A", letterSpacing: "0.15em" }}>
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
                background: "rgba(0,0,0,0.88)",
                display:   "flex", alignItems: "center", justifyContent: "center",
                zIndex:    30,
              }}
            >
              <div style={{ textAlign: "center", padding: 32 }}>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: 80, color: "#CC2A2A", marginBottom: 8 }} className="animate-game-over">
                  GAME OVER
                </div>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#5A5A5A", marginBottom: 28 }}>
                  {isMultiAgent ? "La simulation est terminée." : "Session interrompue. Reprenez une simulation."}
                </p>
                <button
                  onClick={handleRestartSimulation}
                  style={{
                    fontFamily:    "'Space Mono', monospace",
                    fontSize:      11,
                    fontWeight:    700,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    padding:       "12px 24px",
                    background:    "transparent",
                    color:         "#CC2A2A",
                    border:        "2px solid #CC2A2A",
                    boxShadow:     "3px 3px 0 #CC2A2A",
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
              justifyContent:"center",
              padding:       "20px 24px",
              background:    "#1A1A1A",
              borderTop:     `2px solid ${isMultiAgent ? "rgba(74,144,217,0.15)" : "rgba(255,91,34,0.15)"}`,
            }}
          >
            {hasMic ? (
              <PushToTalk
                onSpeechResult={(t) => sendAction(t)}
                disabled={isLoading || gameState.isGameOver}
                onRecordingChange={(isRecording) => {
                  isRecordingRef.current = isRecording;
                  if (isRecording && audioRef.current) {
                    audioRef.current.pause();
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
            ) : (
              <TextInput onSubmit={(t) => sendAction(t)} disabled={isLoading || gameState.isGameOver} />
            )}
          </div>
        )}
      </div>

      {/* ====== SIDE PANEL (35%) ====== */}
      <div style={{ width: "35%", minWidth: 300, maxWidth: 400, background: "#1A1A1A", borderLeft: `2px solid ${isMultiAgent ? "rgba(74,144,217,0.1)" : "rgba(255,91,34,0.1)"}`, overflowY: "auto" }}>
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
            <div style={{ position: "relative", height: 240, borderTop: "1px solid rgba(74,144,217,0.1)", flexShrink: 0 }}>
              <MissionFeed items={missionFeedItems} isActive={isLoading} />
            </div>
          </>
        ) : (
          <SidePanel
            gameState={gameState}
            modeLabel={"Simulation Formation"}
            modeSubtitle={"Mistral Adaptive Engine"}
          />
        )}
      </div>

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
