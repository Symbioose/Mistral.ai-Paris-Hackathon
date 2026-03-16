import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} Mo).` },
        { status: 413 },
      );
    }

    const filename = file.name.toLowerCase();
    let text = "";

    if (filename.endsWith(".txt") || file.type === "text/plain") {
      // --- Plain text ---
      text = await file.text();
    } else if (filename.endsWith(".pdf") || file.type === "application/pdf") {
      // --- PDF extraction ---
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Dynamic import — pdf-parse exports differ between CJS/ESM builds
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfMod: any = await import("pdf-parse");
      const pdfParse = pdfMod.default ?? pdfMod;
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else {
      return NextResponse.json({ error: "Format non supporté. Utilisez .txt ou .pdf." }, { status: 400 });
    }

    // Clean up the text
    text = text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text || text.length < 50) {
      return NextResponse.json({ error: "Le fichier semble vide ou illisible." }, { status: 400 });
    }

    return NextResponse.json({
      text,
      filename: file.name,
      charCount: text.length,
    });
  } catch (e) {
    console.error("[Upload] Error:", e);
    return NextResponse.json({ error: "Erreur lors de l'extraction du fichier." }, { status: 500 });
  }
}
