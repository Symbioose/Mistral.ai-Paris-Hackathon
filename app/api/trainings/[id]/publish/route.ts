import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";
import { prepareGamePlan } from "@/app/lib/agents/prepare";
import { ingestDocument } from "@/app/lib/copilot/ingest";

export const maxDuration = 120; // AI generation can take 10-30s

// POST /api/trainings/[id]/publish — generate game plan + publish (manager only)
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Fetch training with document data for game plan generation
  const { data: training, error: fetchError } = await supabase
    .from("trainings")
    .select("id, manager_id, status, game_plan, document_text, document_filename")
    .eq("id", id)
    .single();

  if (fetchError || !training) {
    return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
  }

  if (training.manager_id !== user.id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Fast path: game_plan already exists, just publish
  if (training.game_plan) {
    const { data: updated, error: updateError } = await supabase
      .from("trainings")
      .update({ status: "published" })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ training: updated });
  }

  // No game plan yet — generate it
  if (!training.document_text) {
    return NextResponse.json({ error: "Aucun document associé à cette formation" }, { status: 400 });
  }

  // Set status to processing immediately
  await supabase.from("trainings").update({ status: "processing" }).eq("id", id);

  try {
    const gamePlan = await prepareGamePlan(
      training.document_text,
      training.document_filename || "Document",
    );

    const { data: updated, error: updateError } = await supabase
      .from("trainings")
      .update({ game_plan: gamePlan, status: "published" })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      // Revert to draft on DB error
      await supabase.from("trainings").update({ status: "draft" }).eq("id", id);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Ingest document for Copilot RAG (non-blocking — don't fail publish if this fails)
    try {
      await ingestDocument(id, training.document_text);
    } catch (ingestErr) {
      console.error("[publish] Copilot ingestion failed (non-blocking):", ingestErr);
    }

    return NextResponse.json({ training: updated });
  } catch (err) {
    console.error("[publish] Game plan generation failed:", err);
    // Revert to draft so manager can retry
    await supabase.from("trainings").update({ status: "draft" }).eq("id", id);
    return NextResponse.json(
      { error: "Échec de la génération du game plan. Veuillez réessayer." },
      { status: 500 },
    );
  }
}
