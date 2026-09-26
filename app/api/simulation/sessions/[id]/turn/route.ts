import { conversationClient } from "@/app/lib/simulation/models";
import { personaSystemPrompt } from "@/app/lib/simulation/persona";
import {
  body,
  dbError,
  failure,
  HttpError,
  loadSession,
  uuid,
} from "@/app/lib/simulation/server";
export const maxDuration = 120;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await loadSession((await params).id, true);
    const b = await body(req);
    if (
      typeof b.text !== "string" ||
      !b.text.trim() ||
      b.text.length > 6000 ||
      !uuid(b.requestId)
    )
      throw new HttpError(
        400,
        "Texte (1–6000 caractères) et requestId UUID requis",
      );
    const text = b.text.trim();
    const { data: previous, error: pe } = await a.admin
      .from("simulation_turns")
      .select("id,role,content")
      .eq("session_id", a.session.id)
      .eq("request_id", b.requestId);
    dbError(pe);
    const previousUser = previous?.find((t) => t.role === "user"),
      previousAssistant = previous?.find((t) => t.role === "assistant");
    if (previousUser && previousUser.content !== text)
      throw new HttpError(409, "Ce requestId correspond à un autre message");
    const encode = (event: string, data: unknown) =>
      new TextEncoder().encode(
        `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
      );
    if (previousAssistant)
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(encode("delta", { text: previousAssistant.content }));
            c.enqueue(encode("done", { turnId: previousAssistant.id }));
            c.close();
          },
        }),
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
          },
        },
      );
    if (a.session.status !== "active")
      throw new HttpError(
        409,
        "Cette session ne peut plus recevoir de messages",
      );
    if (a.turns.length >= 120)
      throw new HttpError(
        400,
        "Limite de conversation atteinte. Terminez l’évaluation.",
      );
    const token = crypto.randomUUID();
    const { data: claimed, error: ce } = await a.admin.rpc("simulation_claim", {
      sid: a.session.id,
      token,
      evaluating: false,
    });
    dbError(ce);
    if (!claimed)
      throw new HttpError(
        409,
        "Une réponse ou une évaluation est déjà en cours",
      );
    // Reload history after acquiring the lease: another request may have committed meanwhile.
    const { data: history, error: he } = await a.admin
      .from("simulation_turns")
      .select("id,role,content,request_id")
      .eq("session_id", a.session.id)
      .order("created_at");
    if (he) {
      await a.admin
        .from("simulation_sessions")
        .update({ lease_token: null, lease_until: null })
        .eq("id", a.session.id)
        .eq("lease_token", token);
      dbError(he);
    }
    const racedUser = history?.find(
      (t) => t.request_id === b.requestId && t.role === "user",
    );
    const racedAssistant = history?.find(
      (t) => t.request_id === b.requestId && t.role === "assistant",
    );
    if (racedAssistant) {
      await a.admin
        .from("simulation_sessions")
        .update({ lease_token: null, lease_until: null })
        .eq("id", a.session.id)
        .eq("lease_token", token);
      if (racedUser?.content !== text)
        throw new HttpError(409, "Ce requestId correspond à un autre message");
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(encode("delta", { text: racedAssistant.content }));
            c.enqueue(encode("done", { turnId: racedAssistant.id }));
            c.close();
          },
        }),
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if ((history?.length || 0) >= 120) {
      await a.admin
        .from("simulation_sessions")
        .update({ lease_token: null, lease_until: null })
        .eq("id", a.session.id)
        .eq("lease_token", token);
      throw new HttpError(400, "Limite de conversation atteinte.");
    }
    let disconnected = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        disconnected = true;
      },
      async start(controller) {
        const send = (event: string, data: unknown) => {
          if (!disconnected) controller.enqueue(encode(event, data));
        };
        try {
          const {
            client,
            model: personaModel,
            provider,
          } = conversationClient(a.session.conversation_model);
          const response = await client.chat.completions.create(
            {
              model: personaModel,
              stream: true,
              max_tokens: 160,
              temperature: 0.7,
              messages: [
                {
                  role: "system",
                  content: personaSystemPrompt(
                    a.config,
                    a.session.module_number,
                  ),
                },
                ...(history || []).map((t) => ({
                  role: t.role as "user" | "assistant",
                  content: t.content,
                })),
                { role: "user", content: text },
              ],
            },
            { timeout: 90000, maxRetries: 0 },
          );
          let content = "";
          let actualModel = a.session.conversation_model;
          for await (const chunk of response) {
            if (chunk.model) actualModel = `${provider}:${chunk.model}`;
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              content += text;
              send("delta", { text });
            }
          }
          if (!content.trim()) throw new Error("Réponse vide");
          const { data: turnId, error } = await a.admin.rpc(
            "simulation_commit_turn",
            {
              sid: a.session.id,
              token,
              rid: b.requestId,
              user_text: text,
              assistant_text: content,
              assistant_model: actualModel,
            },
          );
          dbError(error);
          send("done", { turnId });
        } catch (e) {
          console.error("[simulation turn]", e);
          send("error", {
            message:
              "La réponse n’a pas été enregistrée. Réessayez ce message.",
          });
        } finally {
          await a.admin
            .from("simulation_sessions")
            .update({ lease_token: null, lease_until: null })
            .eq("id", a.session.id)
            .eq("lease_token", token);
          if (!disconnected) controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
