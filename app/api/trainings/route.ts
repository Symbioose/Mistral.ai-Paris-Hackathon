import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/trainings — list trainings for current user
export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  }

  if (profile.role === "manager") {
    // Manager sees their own trainings with enrollment counts
    const { data: trainings, error } = await supabase
      .from("trainings")
      .select("*, enrollments(count)")
      .eq("manager_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ trainings });
  }

  // Student sees their enrollments with training info
  const { data: enrollments, error } = await supabase
    .from("enrollments")
    .select("*, trainings(id, title, description, join_code)")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ enrollments });
}
