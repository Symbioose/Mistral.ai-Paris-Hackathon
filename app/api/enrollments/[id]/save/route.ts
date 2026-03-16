import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/enrollments/[id]/save — save game state (pause & resume)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const { gameState, chatHistory, score, totalQuestions, correctAnswers, completed } = body;

  const updateData: Record<string, unknown> = {
    last_played_at: new Date().toISOString(),
  };

  if (gameState !== undefined) updateData.game_state = gameState;
  if (chatHistory !== undefined) updateData.chat_history = chatHistory;
  if (score !== undefined) updateData.score = score;
  if (totalQuestions !== undefined) updateData.total_questions = totalQuestions;
  if (correctAnswers !== undefined) updateData.correct_answers = correctAnswers;

  if (completed) {
    updateData.status = "completed";
  } else if (gameState) {
    updateData.status = "in_progress";
  }

  const { data: enrollment, error } = await supabase
    .from("enrollments")
    .update(updateData)
    .eq("id", id)
    .eq("student_id", user.id) // RLS + explicit check
    .select()
    .single();

  if (error) {
    console.error("[enrollments/save] DB error:", error.message);
    return NextResponse.json({ error: "Échec de la sauvegarde" }, { status: 500 });
  }

  return NextResponse.json({ enrollment });
}
