import { NextRequest, NextResponse } from "next/server";

const MAX_CHARS = 12000; // ~3000 tokens — safe for Mistral context

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
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

    // Truncate to avoid blowing up the Mistral context
    const truncated = text.length > MAX_CHARS;
    if (truncated) {
      text = text.slice(0, MAX_CHARS) + "\n\n[Document tronqué à 12 000 caractères pour des raisons de performance.]";
    }

    if (!text || text.length < 50) {
      return NextResponse.json({ error: "Le fichier semble vide ou illisible." }, { status: 400 });
    }

    return NextResponse.json({
      text,
      filename: file.name,
      charCount: text.length,
      truncated,
    });
  } catch (e) {
    console.error("[Upload] Error:", e);
    return NextResponse.json({ error: "Erreur lors de l'extraction du fichier." }, { status: 500 });
  }
}
