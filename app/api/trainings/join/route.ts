import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { joinCode } = await request.json();

  if (!joinCode || typeof joinCode !== "string") {
    return NextResponse.json({ error: "Code requis" }, { status: 400 });
  }

  const supabase = await createClient();

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Check role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "student") {
    return NextResponse.json({ error: "Seuls les étudiants peuvent rejoindre une formation" }, { status: 403 });
  }

  // Find training by join_code
  const code = joinCode.trim().toUpperCase();
  const { data: training, error: trainingError } = await supabase
    .from("trainings")
    .select("id, title, status")
    .eq("join_code", code)
    .single();

  if (trainingError || !training) {
    return NextResponse.json({ error: "Code invalide ou formation introuvable" }, { status: 404 });
  }

  if (training.status !== "published") {
    return NextResponse.json({ error: "Cette formation n'est pas encore disponible" }, { status: 403 });
  }

  // Check if already enrolled
  const { data: existing } = await supabase
    .from("enrollments")
    .select("id, status")
    .eq("student_id", user.id)
    .eq("training_id", training.id)
    .single();

  if (existing) {
    return NextResponse.json({
      enrollment: existing,
      training: { id: training.id, title: training.title },
      alreadyEnrolled: true,
    });
  }

  // Create enrollment
  const { data: enrollment, error: enrollError } = await supabase
    .from("enrollments")
    .insert({
      student_id: user.id,
      training_id: training.id,
    })
    .select()
    .single();

  if (enrollError) {
    return NextResponse.json({ error: "Impossible de rejoindre la formation" }, { status: 500 });
  }

  return NextResponse.json({
    enrollment,
    training: { id: training.id, title: training.title },
    alreadyEnrolled: false,
  });
}
