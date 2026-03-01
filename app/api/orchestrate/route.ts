import { NextRequest } from "next/server";
import { prepareGamePlan } from "@/app/lib/agents/prepare";

export const maxDuration = 120; // seconds — 3 Mistral calls

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  let documentText = "";
  let filename = "Document de formation";

  try {
    const body = await req.json();
    documentText = String(body?.documentText || "");
    filename = String(body?.filename || filename);
  } catch {
    // Safe defaults
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

        const docTitle = filename ? String(filename).replace(/\.(pdf|txt)$/i, "") : "Document de formation";

        const gamePlan = await prepareGamePlan(text, docTitle, (message) => {
          send({ type: "status", message });
        });

        // Send scenario
        send({ type: "scenario", data: gamePlan.scenario });

        // Send agents one by one (with delay for animation)
        for (const agent of gamePlan.agents) {
          await delay(220);
          send({ type: "new_agent", data: agent });
        }
        // Send learning agent
        await delay(220);
        send({ type: "new_agent", data: gamePlan.learningAgent });

        // Build evaluation_grid from categories (backward compat with UI)
        const evaluation_grid = gamePlan.categories.map((cat, i) => ({
          topic: cat.name,
          weight: Math.max(1, 5 - i),
          test_method: cat.description,
        }));
        send({ type: "evaluation_grid", data: evaluation_grid });

        // Send the full setup + gamePlan
        send({
          type: "ready",
          data: {
            scenario: gamePlan.scenario,
            agents: [...gamePlan.agents, gamePlan.learningAgent],
            evaluation_grid,
            gamePlan,
          },
        });
      } catch (error) {
        console.error("[orchestrate] Error:", error instanceof Error ? error.message : String(error));
        send({
          type: "error",
          message: "Erreur lors de la préparation. Veuillez réessayer.",
          details: error instanceof Error ? error.message : "unknown",
        });
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
