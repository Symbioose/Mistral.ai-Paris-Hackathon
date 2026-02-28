import { NextRequest, NextResponse } from "next/server";
import { GameAction } from "@/app/lib/types";

// ============================================
// RATP Survival — Mistral + ElevenLabs
// ============================================

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY!;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

// Two voices: narrator vs NPC
const VOICE_IDS = {
  narrator: "ErXwobaYiN019PkySvjV", // Antoni — grave, fatigué, parisien
  npc:      "pNInz6obpgDQGcFmaJgB", // Adam  — différent, plus monstrueux
};

// ---- System Prompt builder ----

function buildSystemPrompt(documentContext?: string): string {
  const FORMATTING_RULES = `
RÈGLES ABSOLUES DE FORMATAGE — CRITIQUE POUR LE TEXT-TO-SPEECH :
- TU NE DOIS UTILISER AUCUN FORMATAGE MARKDOWN.
- AUCUN ASTÉRISQUE, AUCUN TIRET, AUCUN GRAS, AUCUN ITALIQUE.
- AUCUNE LISTE, AUCUNE ÉNUMÉRATION.
- AUCUN EMOJI DANS LE TEXTE NARRATIF.
- GÉNÈRE UNIQUEMENT DU TEXTE BRUT POUR LA SYNTHÈSE VOCALE.

RÈGLES DE LONGUEUR — CRITIQUE POUR LA VITESSE :
- Tes réponses doivent être ULTRA COURTES, punchy et viscérales.
- MAXIMUM 2 ou 3 phrases. Pas plus.
- Ne propose JAMAIS de choix multiples de type A, B ou C.
- Décris la situation d'urgence et termine par "Que fais-tu ?" pour laisser le joueur décider.

RÈGLES DU JEU :
- Tu DOIS TOUJOURS appeler narrate en premier avec le texte de la scène.
- Tu DOIS appeler dice_roll et update_hp à chaque tour pour animer le tableau de bord.
- La difficulté augmente progressivement : tours 1-2 faciles, tours 3+ difficiles.
- Si le joueur a 0 HP ou moins, appelle game_over.`;

  if (documentContext) {
    // RAG to RPG mode — dynamic serious game based on the uploaded document
    return `Tu es un Maître du Jeu impitoyable et sarcastique spécialisé dans les Serious Games pédagogiques.

Je te fournis un document de référence ci-dessous. Ton but est de TESTER LES CONNAISSANCES du joueur sur ce document en le plongeant dans un jeu de rôle de survie vocal et immersif.

DOCUMENT DE RÉFÉRENCE :
---
${documentContext}
---

TON RÔLE :
- Crée un univers de survie thématiquement cohérent avec le contenu du document. Si c'est un manuel de procédures, le joueur est un employé en crise. Si c'est un cours d'histoire, le joueur y est plongé. Si c'est un document médical, une urgence médicale se déroule.
- Pose des situations critiques où le joueur DOIT appliquer des informations précises du document pour survivre.
- Si le joueur donne une mauvaise réponse ou ignore une règle du document, il perd des HP.
- Si le joueur cite ou applique correctement une information du document, il gagne des HP et/ou un objet.
- Les PNJ (speaker_type: npc) peuvent être des personnages du document qui posent des questions ou créent des obstacles.
- Ne révèle jamais les réponses directement. Force le joueur à les trouver.
${FORMATTING_RULES}`;
  }

  // Default RATP mode
  return `Tu es le Maître du Jeu de "RATP Survival : L'Odyssée Souterraine", un RPG d'horreur-comédie dans le métro parisien pendant une grève générale.

PERSONNALITÉ :
- Narrateur sarcastique, stressant, très parisien, désabusé.
- Tu mélanges jargon RPG et jargon RATP : "jet de sauvegarde", "incident voyageur", "zone 1-5".
- Les monstres : contrôleurs zombifiés, pigeons mutants géants, touristes bloquant les couloirs, musiciens dont la musique est une arme, rats syndiqués.

INVENTAIRE INITIAL : Pass Navigo (id: navigo) périmé, Café froid (id: cafe).
STATION DE DÉPART : Châtelet-Les Halles.
${FORMATTING_RULES}`;
}

// ---- Mistral Tools ----

const GAME_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "narrate",
      description: "OBLIGATOIRE. Appelle cet outil EN PREMIER à chaque réponse pour narrer la scène. Le texte doit être du texte BRUT, sans aucun formatage markdown.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "La narrative en texte brut (SANS MARKDOWN, SANS EMOJIS, SANS ASTÉRISQUES). 2-3 phrases max. Terminer par 'Que fais-tu ?'",
          },
          speaker_type: {
            type: "string",
            enum: ["narrator", "npc"],
            description: "'narrator' pour le Maître du Jeu, 'npc' pour un personnage non-joueur qui parle.",
          },
          speaker_name: {
            type: "string",
            description: "Nom du locuteur : 'Maitre du Jeu', 'Contrôleur Zombie', 'Pigeon Mutant', etc.",
          },
        },
        required: ["text", "speaker_type", "speaker_name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_hp",
      description: "Modifie les points de vie du joueur. Appelle à CHAQUE tour.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "HP à ajouter (négatif = dégâts, positif = soin). Entre -25 et +15." },
          reason: { type: "string", description: "Raison courte en texte brut." },
        },
        required: ["amount", "reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_item",
      description: "Ajoute un objet thématique RATP/Paris à l'inventaire.",
      parameters: {
        type: "object",
        properties: {
          id:          { type: "string", description: "ID unique snake_case" },
          name:        { type: "string", description: "Nom de l'objet en français" },
          emoji:       { type: "string", description: "Un seul emoji" },
          description: { type: "string", description: "Description sarcastique, 1 phrase, texte brut." },
        },
        required: ["id", "name", "emoji", "description"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_item",
      description: "Retire un objet de l'inventaire (consommé, perdu, volé).",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string", description: "ID de l'objet à retirer." },
        },
        required: ["item_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "dice_roll",
      description: "Lance un dé 20 pour résoudre l'action. Appelle à CHAQUE tour.",
      parameters: {
        type: "object",
        properties: {
          action:     { type: "string", description: "Nom court de l'action (ex: Esquive du pigeon)." },
          difficulty: { type: "number", description: "Difficulté 1-20. Le joueur doit faire >= ce nombre." },
        },
        required: ["action", "difficulty"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "change_station",
      description: "Déplace le joueur vers une nouvelle station.",
      parameters: {
        type: "object",
        properties: {
          station: { type: "string", description: "Nom exact de la station." },
        },
        required: ["station"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "game_over",
      description: "Termine la partie si le joueur est mort ou a fait une erreur fatale.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Raison de la mort, sarcastique, texte brut." },
        },
        required: ["reason"],
      },
    },
  },
];

// ---- Conversation history (in-memory, resets on server restart) ----
const conversationHistory = new Map<string, Array<{ role: string; content: string }>>();

// ---- Parse tool calls into GameActions ----
interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface ParseResult {
  narrative: string;
  speakerType: "narrator" | "npc";
  speakerName: string;
  actions: GameAction[];
}

function parseToolCalls(toolCalls: ToolCall[]): ParseResult {
  let narrative = "";
  let speakerType: "narrator" | "npc" = "narrator";
  let speakerName = "Maître du Jeu";
  const actions: GameAction[] = [];

  for (const call of toolCalls) {
    try {
      const args = JSON.parse(call.function.arguments);

      switch (call.function.name) {
        case "narrate":
          narrative    = args.text;
          speakerType  = args.speaker_type === "npc" ? "npc" : "narrator";
          speakerName  = args.speaker_name || "Maître du Jeu";
          break;

        case "update_hp":
          actions.push({ type: "update_hp", amount: args.amount });
          break;

        case "add_item":
          actions.push({ type: "add_item", item: { id: args.id, name: args.name, emoji: args.emoji, description: args.description } });
          break;

        case "remove_item":
          actions.push({ type: "remove_item", itemId: args.item_id });
          break;

        case "dice_roll": {
          const roll   = Math.floor(Math.random() * 20) + 1;
          const needed = args.difficulty;
          actions.push({
            type: "dice_roll",
            roll: { id: crypto.randomUUID(), action: args.action, roll, needed, success: roll >= needed, timestamp: Date.now() },
          });
          break;
        }

        case "change_station":
          actions.push({ type: "change_station", station: args.station });
          break;

        case "game_over":
          actions.push({ type: "game_over", reason: args.reason });
          break;
      }
    } catch (e) {
      console.error("[Parse] Failed to parse tool call:", call.function.name, e);
    }
  }

  return { narrative, speakerType, speakerName, actions };
}

// ---- ElevenLabs TTS ----
async function generateSpeech(text: string, speakerType: "narrator" | "npc"): Promise<Buffer | null> {
  const voiceId = VOICE_IDS[speakerType];
  try {
    console.log(`[ElevenLabs] speaker=${speakerType} voice=${voiceId} text="${text.slice(0, 50)}..."`);

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key":   ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept:         "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability:        0.45,
          similarity_boost: 0.80,
          style:            0.55,
          use_speaker_boost: true,
        },
      }),
    });

    console.log(`[ElevenLabs] status=${res.status}`);

    if (!res.ok) {
      console.error("[ElevenLabs] Error:", res.status, await res.text());
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`[ElevenLabs] audio=${buf.byteLength} bytes`);
    return buf;
  } catch (e) {
    console.error("[ElevenLabs] Fetch error:", e);
    return null;
  }
}

// ---- Main route ----
export async function POST(request: NextRequest) {
  const { playerText, turnCount, gameState, sessionId = "default", documentContext } = await request.json();

  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, []);
  }
  const history = conversationHistory.get(sessionId)!;

  // Build the system prompt (dynamic or default)
  const SYSTEM_PROMPT = buildSystemPrompt(documentContext || undefined);

  // Build user message
  let userMessage: string;
  if (turnCount === 0 || !playerText) {
    userMessage = documentContext
      ? "Le joueur commence la session. Présente le contexte du document de manière immersive et viscérale, en le plongeant dans une situation de crise basée sur ce contenu. Commence par narrate."
      : "Le joueur vient d'entrer dans le métro. Début de l'aventure à Châtelet-Les Halles. Commence par narrate.";
  } else {
    const ctx = gameState
      ? `[HP: ${gameState.hp}/${gameState.maxHp} | Station: ${gameState.currentStation} | Inventaire: ${gameState.inventory?.map((i: { name: string }) => i.name).join(", ") || "vide"} | Tour: ${turnCount}]`
      : "";
    userMessage = `${ctx}\nLe joueur dit : "${playerText}"`;
  }

  history.push({ role: "user", content: userMessage });

  try {
    console.log(`[Mistral] turn=${turnCount} msg="${userMessage.slice(0, 60)}..."`);

    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model:       "mistral-large-latest",
        messages:    [{ role: "system", content: SYSTEM_PROMPT }, ...history.slice(-10)],
        tools:       GAME_TOOLS,
        tool_choice: "any",
        temperature: 0.85,
        max_tokens:  350,
      }),
    });

    console.log(`[Mistral] status=${res.status}`);

    if (!res.ok) {
      const err = await res.text();
      console.error("[Mistral] Error:", res.status, err);
      return NextResponse.json({ narrative: "Incident technique sur la ligne. Réessayez.", actions: [], audioBase64: null, speakerName: "Maître du Jeu" }, { status: 500 });
    }

    const data = await res.json();
    const message = data.choices[0].message;

    console.log(`[Mistral] content="${(message.content || "").slice(0, 60)}" tool_calls=${message.tool_calls?.length ?? 0}`);

    let narrative    = "";
    let speakerType: "narrator" | "npc" = "narrator";
    let speakerName  = "Maître du Jeu";
    let actions: GameAction[] = [];

    if (message.tool_calls?.length > 0) {
      const parsed = parseToolCalls(message.tool_calls);
      narrative   = parsed.narrative;
      speakerType = parsed.speakerType;
      speakerName = parsed.speakerName;
      actions     = parsed.actions;
    }

    // Fallback: use message.content if narrate tool wasn't called
    if (!narrative) {
      narrative = message.content || "";
    }

    // Last-resort fallback if Mistral returned nothing useful
    if (!narrative && message.tool_calls) {
      console.log("[Mistral] No narrate call, requesting narrative via follow-up...");

      const toolResults = message.tool_calls.map((tc: ToolCall) => ({
        role:        "tool",
        tool_call_id: tc.id,
        name:        tc.function.name,
        content:     JSON.stringify({ success: true }),
      }));

      const followUp = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model:       "mistral-large-latest",
          temperature: 0.85,
          max_tokens:  200,
          messages: [
            { role: "system",    content: SYSTEM_PROMPT },
            ...history.slice(-9),
            { role: "assistant", content: message.content || null, tool_calls: message.tool_calls },
            ...toolResults,
          ],
        }),
      });

      if (followUp.ok) {
        const fData = await followUp.json();
        narrative = fData.choices[0].message.content || "";
        console.log(`[Mistral] Follow-up narrative="${narrative.slice(0, 60)}"`);
      }
    }

    if (!narrative) {
      narrative = "Le tunnel gronde. Quelque chose approche. Que fais-tu ?";
    }

    // Save to history
    history.push({ role: "assistant", content: narrative });
    if (history.length > 20) history.splice(0, history.length - 20);

    // TTS
    let audioBase64: string | null = null;
    const audioBuf = await generateSpeech(narrative, speakerType);
    if (audioBuf) {
      audioBase64 = audioBuf.toString("base64");
    }

    return NextResponse.json({ narrative, actions, audioBase64, speakerName, speakerType });
  } catch (e) {
    console.error("[Route] Error:", e);
    return NextResponse.json({ narrative: "Incident voyageur. Redémarrage en cours.", actions: [], audioBase64: null, speakerName: "Maître du Jeu" }, { status: 500 });
  }
}
