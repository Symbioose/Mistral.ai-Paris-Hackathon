import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/enrollments/[id]/detail
 * Returns full enrollment data including game_state.
 * Accessible by the manager who owns the linked training.
 */
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

  // Fetch enrollment with joined training for ownership check
  const { data: enrollment, error } = await supabase
    .from("enrollments")
    .select(
      "id, student_id, training_id, status, score, total_questions, correct_answers, game_state, last_played_at, created_at, profiles(full_name, avatar_url), trainings(manager_id, title)",
    )
    .eq("id", id)
    .single();

  if (error || !enrollment) {
    return NextResponse.json({ error: "Inscription introuvable" }, { status: 404 });
  }

  // Allow access if: manager owns the training OR student owns the enrollment
  const training = enrollment.trainings as unknown as { manager_id: string; title: string } | null;
  const isManager = training?.manager_id === user.id;
  const isStudent = enrollment.student_id === user.id;

  if (!isManager && !isStudent) {
    return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
  }

  // Strip large fields from game_state to reduce payload size.
  // The client only needs scores, totalScore, interactionState, and scenario title.
  const rawState = enrollment.game_state as Record<string, unknown> | null;
  if (rawState && typeof rawState === "object") {
    const { conversationHistory, agents, gamePlan, sharedMemory, playerActions, ...lightState } = rawState;
    // Keep scenario but strip its acts detail (only title needed)
    if (lightState.scenario && typeof lightState.scenario === "object") {
      const scenario = lightState.scenario as Record<string, unknown>;
      lightState.scenario = { title: scenario.title };
    }
    (enrollment as Record<string, unknown>).game_state = lightState;
  }

  return NextResponse.json({ enrollment });
}
