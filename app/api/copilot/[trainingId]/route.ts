// app/api/copilot/[trainingId]/route.ts

import { createClient } from "@/app/lib/supabase/server";
import { generateQueryEmbedding } from "@/app/lib/copilot/embeddings";
import { getClient } from "@/app/lib/agents/openai-client";

export const maxDuration = 60;

const SYSTEM_PROMPT = `Tu es le Copilote de formation YouGotIt. Tu aides l'apprenant à comprendre et retrouver des informations dans son document de formation.

COMMENT RÉPONDRE :
1. Base-toi sur les passages fournis ci-dessous. Tu peux expliquer, synthétiser, reformuler et raisonner à partir de ces passages pour répondre aux questions, même générales.
2. Pour chaque point clé de ta réponse, cite le passage pertinent entre guillemets suivi de la référence [chunk_X] (où X est le numéro du chunk). L'apprenant pourra cliquer dessus pour voir le passage dans le document.
3. Après chaque citation, explique ce que le passage signifie de façon pédagogique et accessible. Vulgarise si nécessaire.
4. Pour les questions générales ou transversales, n'hésite pas à combiner plusieurs passages pour construire une réponse complète.
5. Si la question porte sur un sujet qui n'est absolument pas couvert par les passages fournis, dis-le clairement.
6. Ne fabrique jamais d'informations qui ne sont pas dans le document — mais tu peux expliquer, contextualiser et connecter les informations qui s'y trouvent.
7. Réponds en français. Sois pédagogue et utile.`;

function buildContextPrompt(chunks: Array<{ chunk_index: number; content: string; start_char: number; end_char: number }>): string {
  return chunks
    .map((c) => `[chunk_${c.chunk_index}] (caractères ${c.start_char}-${c.end_char}):\n"${c.content}"`)
    .join("\n\n");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ trainingId: string }> },
) {
  const { trainingId } = await params;
  const supabase = await createClient();

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401 });
  }

  // Check enrollment or manager ownership
  const { data: access } = await supabase
    .from("enrollments")
    .select("id")
    .eq("training_id", trainingId)
    .eq("student_id", user.id)
    .limit(1);

  if (!access || access.length === 0) {
    // Check if manager
    const { data: training } = await supabase
      .from("trainings")
      .select("manager_id")
      .eq("id", trainingId)
      .single();

    if (!training || training.manager_id !== user.id) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403 });
    }
  }

  // Parse body
  const body = await request.json();
  const { message, history } = body as {
    message: string;
    history: Array<{ role: string; content: string }>;
  };

  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ error: "Message requis" }), { status: 400 });
  }

  // Sanitize user message length
  const safeMessage = message.slice(0, 2000);

  // Validate history — only allow user/assistant roles, limit to 10
  const safeHistory = (history || [])
    .filter((h) => h.role === "user" || h.role === "assistant")
    .slice(-10)
    .map((h) => ({ role: h.role as "user" | "assistant", content: h.content.slice(0, 2000) }));

  // 1. Embed the query
  const queryEmbedding = await generateQueryEmbedding(safeMessage);

  // 2. Semantic search via match_chunks RPC
  const { data: chunks, error: matchError } = await supabase.rpc("match_chunks", {
    query_embedding: JSON.stringify(queryEmbedding),
    p_training_id: trainingId,
    match_count: 6,
  });

  if (matchError) {
    console.error("[copilot] match_chunks error:", matchError);
    return new Response(JSON.stringify({ error: "Erreur de recherche" }), { status: 500 });
  }

  if (!chunks || chunks.length === 0) {
    return new Response(JSON.stringify({ error: "Aucun contenu indexé pour cette formation" }), { status: 404 });
  }

  // 3. Build messages for LLM
  const contextBlock = buildContextPrompt(chunks);
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\nPassages du document :\n${contextBlock}` },
    ...safeHistory,
    { role: "user", content: safeMessage },
  ];

  // 4. Stream response via SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send sources first
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: "sources", chunks: chunks.map((c: { id: string; chunk_index: number; content: string; start_char: number; end_char: number; similarity: number }) => ({ id: c.id, chunk_index: c.chunk_index, content: c.content, start_char: c.start_char, end_char: c.end_char, similarity: c.similarity })) })}\n\n`
        ));

        // Stream LLM response (reuse shared OpenAI client)
        const openai = getClient();

        const completion = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages,
          temperature: 0.3,
          max_tokens: 1000,
          stream: true,
        });

        let fullContent = "";
        for await (const chunk of completion) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: "delta", delta })}\n\n`
            ));
          }
        }

        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: "done", content: fullContent })}\n\n`
        ));

        controller.close();
      } catch (err) {
        console.error("[copilot] stream error:", err);
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: "error", message: "Erreur lors de la génération" })}\n\n`
        ));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
