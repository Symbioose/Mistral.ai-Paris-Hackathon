import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/enrollments/[id] — fetch a single enrollment with game_state
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

  const { data: enrollment, error } = await supabase
    .from("enrollments")
    .select("id, student_id, training_id, status, score, total_questions, correct_answers, game_state, last_played_at, created_at")
    .eq("id", id)
    .eq("student_id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ enrollment });
}
