import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/trainings/[id]/enrollments — list enrollments for a training (manager only)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Verify ownership — only the manager who owns the training can list its enrollments
  const { data: training, error: trainingError } = await supabase
    .from("trainings")
    .select("id, manager_id")
    .eq("id", id)
    .single();

  if (trainingError || !training) {
    return NextResponse.json(
      { error: "Formation introuvable" },
      { status: 404 },
    );
  }

  if (training.manager_id !== user.id) {
    return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
  }

  const { data: enrollments, error } = await supabase
    .from("enrollments")
    .select(
      "id, student_id, status, score, total_questions, correct_answers, last_played_at, created_at, profiles(full_name, avatar_url)",
    )
    .eq("training_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ enrollments });
}
