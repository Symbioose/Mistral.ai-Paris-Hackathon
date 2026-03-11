"use client";

import { useCallback, useRef, useState } from "react";

interface FileUploadProps {
  onDocumentReady: (text: string, filename: string) => void;
}

export default function FileUpload({ onDocumentReady }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ filename: string; charCount: number; snippet: string } | null>(null);
  const [documentText, setDocumentText] = useState<string | null>(null);
  const [hoverLaunch, setHoverLaunch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setIsLoading(true);
    setPreview(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Erreur lors du traitement.");
        return;
      }

      setDocumentText(data.text);
      setPreview({
        filename: data.filename,
        charCount: data.charCount,
        snippet: data.text.slice(0, 200).replace(/\n+/g, " "),
      });
    } catch {
      setError("Impossible de lire le fichier. Vérifiez qu'il n'est pas corrompu.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".txt") && !ext.endsWith(".pdf")) {
      setError("Format non supporté. Utilisez .txt ou .pdf uniquement.");
      return;
    }
    processFile(file);
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleLaunch = () => {
    if (documentText && preview) {
      onDocumentReady(documentText, preview.filename);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>

      {/* Drop zone */}
      <div
        onClick={() => !isLoading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          border: isDragging
            ? "2px dashed var(--corp-blue)"
            : preview
              ? "2px solid var(--corp-success)"
              : "2px dashed var(--corp-border)",
          background: isDragging
            ? "rgba(37,99,235,0.04)"
            : preview
              ? "rgba(5,150,105,0.04)"
              : "var(--corp-bg-subtle)",
          borderRadius: 16,
          padding: "48px 32px",
          cursor: isLoading ? "wait" : "pointer",
          textAlign: "center",
          transition: "all 0.2s ease",
          userSelect: "none",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.pdf"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />

        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 40,
              height: 40,
              border: "3px solid rgba(37,99,235,0.2)",
              borderTop: "3px solid var(--corp-blue)",
              borderRadius: "50%",
              animation: "corp-spinner 0.8s linear infinite",
            }} />
            <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "var(--corp-text-secondary)", margin: 0 }}>
              Extraction en cours...
            </p>
          </div>
        ) : preview ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="rgba(5,150,105,0.1)" stroke="var(--corp-success)" strokeWidth="1.5" />
              <polyline points="9 12 11 14 15 10" fill="none" stroke="var(--corp-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 16, fontWeight: 600, color: "var(--corp-navy)", marginTop: 12, marginBottom: 4 }}>
              {preview.filename}
            </p>
            <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-text-secondary)", margin: 0 }}>
              {preview.charCount.toLocaleString()} caractères extraits
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--corp-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 16, fontWeight: 600, color: "var(--corp-navy)", marginTop: 16, marginBottom: 0 }}>
              Déposez votre document ici
            </p>
            <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "var(--corp-text-secondary)", marginTop: 8, marginBottom: 0 }}>
              ou cliquez pour sélectionner
            </p>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 8 }}>
              {[".TXT", ".PDF"].map((ext) => (
                <span
                  key={ext}
                  style={{
                    fontFamily: "var(--corp-font-body)",
                    fontSize: 12,
                    padding: "4px 12px",
                    border: "1px solid var(--corp-border)",
                    borderRadius: 6,
                    color: "var(--corp-text-muted)",
                    background: "var(--corp-bg-subtle)",
                  }}
                >
                  {ext}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Preview snippet */}
      {preview && (
        <div
          style={{
            background: "var(--corp-bg-subtle)",
            border: "1px solid var(--corp-border)",
            borderRadius: 12,
            padding: "16px 20px",
            boxShadow: "var(--corp-shadow-sm)",
          }}
        >
          <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 11, fontWeight: 600, color: "var(--corp-blue)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8, marginTop: 0 }}>
            Aperçu du contenu
          </p>
          <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-text-secondary)", lineHeight: 1.6, margin: 0 }}>
            {preview.snippet}...
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ border: "1px solid var(--corp-danger)", borderRadius: 8, padding: "12px 16px", background: "rgba(220,38,38,0.04)" }}>
          <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-danger)", margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {/* Launch button */}
      {preview && documentText && (
        <button
          onClick={handleLaunch}
          onMouseEnter={() => setHoverLaunch(true)}
          onMouseLeave={() => setHoverLaunch(false)}
          style={{
            fontFamily: "var(--corp-font-body)",
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "0.02em",
            padding: "16px 24px",
            background: hoverLaunch ? "#1D4ED8" : "var(--corp-blue)",
            color: "white",
            border: "none",
            borderRadius: 12,
            boxShadow: hoverLaunch ? "var(--corp-shadow-lg)" : "var(--corp-shadow-md)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            width: "100%",
            transform: hoverLaunch ? "translateY(-1px)" : "translateY(0)",
          }}
        >
          Lancer la simulation →
        </button>
      )}

      {/* Change file */}
      {preview && (
        <button
          onClick={() => { setPreview(null); setDocumentText(null); setError(null); }}
          style={{
            fontFamily: "var(--corp-font-body)",
            fontSize: 13,
            color: "var(--corp-blue)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "center",
            padding: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
        >
          Changer de document
        </button>
      )}
    </div>
  );
}
