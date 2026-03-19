import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/trainings/[id]/copilot-analytics — aggregated copilot usage stats (manager only)
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

  // Verify ownership — only the manager who owns the training can view its analytics
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

  const { data: queries, error } = await supabase
    .from("copilot_queries")
    .select("id, query_text, section_title, created_at")
    .eq("training_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const allQueries = queries ?? [];
  const totalQueries = allQueries.length;

  // Group by section_title, count unique queries per section
  const sectionCounts = new Map<string, number>();
  for (const q of allQueries) {
    const title = q.section_title ?? "Non classé";
    sectionCounts.set(title, (sectionCounts.get(title) ?? 0) + 1);
  }

  // Build sections array sorted by queryCount descending
  const sections = Array.from(sectionCounts.entries())
    .map(([title, queryCount]) => ({
      title,
      queryCount,
      percentage:
        totalQueries > 0 ? Math.round((queryCount / totalQueries) * 100) : 0,
    }))
    .sort((a, b) => b.queryCount - a.queryCount);

  // Recent queries (last 20, already ordered desc from DB)
  const recentQueries = allQueries.slice(0, 20).map((q) => ({
    text: q.query_text,
    sectionTitle: q.section_title ?? "Non classé",
    createdAt: q.created_at,
  }));

  return NextResponse.json({ sections, totalQueries, recentQueries });
}
