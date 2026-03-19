import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

// DELETE /api/trainings/[id] — delete a training (manager only)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Verify ownership (RLS also enforces this)
  const { data: training } = await supabase
    .from("trainings")
    .select("id, manager_id, document_path")
    .eq("id", id)
    .single();

  if (!training || training.manager_id !== user.id) {
    return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
  }

  // Delete file from Storage if it exists
  if (training.document_path) {
    await supabase.storage
      .from("training-documents")
      .remove([training.document_path]);
  }

  // Delete training (cascades to enrollments via FK)
  const { error } = await supabase
    .from("trainings")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[trainings/delete] DB error:", error.message);
    return NextResponse.json({ error: "Échec de la suppression" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// GET /api/trainings/[id] — get a single training (manager owner or enrolled student)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Fetch training
  const { data: training, error: fetchError } = await supabase
    .from("trainings")
    .select("*, enrollments(count)")
    .eq("id", id)
    .single();

  if (fetchError || !training) {
    return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
  }

  // Access check: must be the manager who owns it OR an enrolled student
  if (training.manager_id !== user.id) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id")
      .eq("training_id", id)
      .eq("student_id", user.id)
      .limit(1);

    if (!enrollment || enrollment.length === 0) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
  }

  return NextResponse.json({ training });
}
