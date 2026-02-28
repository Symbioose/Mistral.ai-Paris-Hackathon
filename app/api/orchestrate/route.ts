import { NextRequest } from "next/server";
import { orchestrateSimulation } from "@/app/lib/agents/orchestrator";
import { tokenize } from "@/app/lib/rag";

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

function sectionSummaries(text: string, limit = 8): string[] {
  const sections = text
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 60)
    .slice(0, limit);

  if (sections.length === 0) {
    return [text.slice(0, 600)];
  }

  return sections.map((section, idx) => `Section ${idx + 1}: ${section.slice(0, 420)}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const { documentText, filename } = await req.json();
  const text = String(documentText || "").trim();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        send({ type: "status", message: "Analyse du document en cours..." });

        const docTitle = filename ? String(filename).replace(/\.(pdf|txt)$/i, "") : "Document de formation";
        const keyConcepts = topTerms(text, 14);
        const summaries = sectionSummaries(text, 8);

        const setup = await orchestrateSimulation({
          docTitle,
          keyConcepts,
          sectionSummaries: summaries,
        });

        send({ type: "scenario", data: setup.scenario });

        for (const agent of setup.agents) {
          await delay(1200);
          send({ type: "new_agent", data: agent });
        }

        send({ type: "evaluation_grid", data: setup.evaluation_grid });
        send({ type: "ready", data: setup });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Orchestration failed" });
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
