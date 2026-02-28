import { NextRequest } from "next/server";
import { fallbackSimulationSetup, orchestrateSimulation } from "@/app/lib/agents/orchestrator";
import { tokenize } from "@/app/lib/rag";

export const maxDuration = 60; // seconds — allows Mistral Large to complete

function topTerms(text: string, limit = 12): string[] {
  const freq = tokenize(text).reduce<Record<string, number>>((acc, token) => {
    acc[token] = (acc[token] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

function sectionSummaries(text: string, limit = 4): string[] {
  const sections = text
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 60)
    .slice(0, limit);

  if (sections.length === 0) {
    return [text.slice(0, 360)];
  }

  return sections.map((section, idx) => `Section ${idx + 1}: ${section.slice(0, 260)}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Orchestration timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  let documentText = "";
  let filename = "Document de formation";

  try {
    const body = await req.json();
    documentText = String(body?.documentText || "");
    filename = String(body?.filename || filename);
  } catch {
    // Some clients can hit this endpoint with an empty or invalid JSON body.
    // Keep safe defaults and proceed with a controlled error payload in-stream.
  }

  const text = String(documentText || "").trim();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        if (!text) {
          send({ type: "error", message: "documentText manquant dans le body JSON." });
          controller.close();
          return;
        }

        send({ type: "status", message: "Analyse du document en cours..." });
        send({ type: "status", message: "Extraction des compétences clés..." });

        const docTitle = filename ? String(filename).replace(/\.(pdf|txt)$/i, "") : "Document de formation";
        const keyConcepts = topTerms(text, 8);
        const summaries = sectionSummaries(text, 4);
        send({ type: "status", message: "Orchestration multi-agents (mode turbo)..." });

        const setup = await withTimeout(
          orchestrateSimulation({
            docTitle,
            keyConcepts,
            sectionSummaries: summaries,
          }),
          12000,
        );

        send({ type: "scenario", data: setup.scenario });

        for (const agent of setup.agents) {
          await delay(220);
          send({ type: "new_agent", data: agent });
        }

        send({ type: "evaluation_grid", data: setup.evaluation_grid });
        send({ type: "ready", data: setup });
      } catch (error) {
        const fallback = fallbackSimulationSetup({
          docTitle: filename ? String(filename).replace(/\.(pdf|txt)$/i, "") : "Document de formation",
          keyConcepts: topTerms(text, 8),
          sectionSummaries: sectionSummaries(text, 4),
        });
        send({
          type: "status",
          message: "Mode rapide activé: génération locale de la simulation.",
          details: error instanceof Error ? error.message : "fallback",
        });
        send({ type: "scenario", data: fallback.scenario });
        for (const agent of fallback.agents) {
          send({ type: "new_agent", data: agent });
        }
        send({ type: "evaluation_grid", data: fallback.evaluation_grid });
        send({ type: "ready", data: fallback, fallback: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
