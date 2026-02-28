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
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%", maxWidth: 520 }}>

      {/* Drop zone */}
      <div
        onClick={() => !isLoading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          border:         `3px solid ${isDragging ? "#FF5B22" : preview ? "#2D7A3A" : "#1A1A1A"}`,
          background:     isDragging ? "rgba(255,91,34,0.05)" : preview ? "rgba(45,122,58,0.04)" : "#FAFAF7",
          padding:        "40px 32px",
          cursor:         isLoading ? "wait" : "pointer",
          textAlign:      "center",
          boxShadow:      `4px 4px 0 ${isDragging ? "#FF5B22" : preview ? "#2D7A3A" : "#1A1A1A"}`,
          transition:     "all 0.15s",
          userSelect:     "none",
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
          <div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 4, height: 32, marginBottom: 12 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="animate-soundwave"
                  style={{ width: 4, height: "100%", background: "#FF5B22", animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#5A5A5A" }}>
              EXTRACTION EN COURS...
            </p>
          </div>
        ) : preview ? (
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 28, color: "#2D7A3A", marginBottom: 8 }}>✓</div>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, color: "#2D7A3A", marginBottom: 4 }}>
              {preview.filename}
            </p>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#5A5A5A", letterSpacing: "0.1em" }}>
              {preview.charCount.toLocaleString()} caracteres extraits
            </p>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "#1A1A1A", marginBottom: 8 }}>
              Deposer votre document ici
            </p>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#5A5A5A", letterSpacing: "0.05em" }}>
              ou cliquer pour selectionner
            </p>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 8 }}>
              {[".TXT", ".PDF"].map((ext) => (
                <span
                  key={ext}
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize:   9,
                    padding:    "3px 8px",
                    border:     "1px solid #1A1A1A",
                    color:      "#1A1A1A",
                    letterSpacing: "0.1em",
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
            background:    "#1A1A1A",
            border:        "2px solid #1A1A1A",
            padding:       "12px 16px",
            boxShadow:     "3px 3px 0 #5A5A5A",
          }}
        >
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#FF5B22", letterSpacing: "0.15em", marginBottom: 6, textTransform: "uppercase" }}>
            Apercu du contenu
          </p>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#C4C0B5", lineHeight: 1.6 }}>
            {preview.snippet}...
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ border: "2px solid #CC2A2A", padding: "10px 14px", background: "rgba(204,42,42,0.05)" }}>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#CC2A2A" }}>
            {error}
          </p>
        </div>
      )}

      {/* Launch button */}
      {preview && documentText && (
        <button
          onClick={handleLaunch}
          style={{
            fontFamily:    "'Space Mono', monospace",
            fontSize:      13,
            fontWeight:    700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            padding:       "16px 24px",
            background:    "#FF5B22",
            color:         "#F3F0E6",
            border:        "3px solid #FF5B22",
            boxShadow:     "5px 5px 0 #CC4919",
            cursor:        "pointer",
            transition:    "all 0.1s",
            width:         "100%",
          }}
          onMouseEnter={(e) => {
            const b = e.currentTarget;
            b.style.boxShadow = "2px 2px 0 #CC4919";
            b.style.transform = "translate(3px,3px)";
          }}
          onMouseLeave={(e) => {
            const b = e.currentTarget;
            b.style.boxShadow = "5px 5px 0 #CC4919";
            b.style.transform = "translate(0,0)";
          }}
        >
          Lancer le Serious Game &rarr;
        </button>
      )}

      {/* Change file */}
      {preview && (
        <button
          onClick={() => { setPreview(null); setDocumentText(null); setError(null); }}
          style={{
            fontFamily:    "'Space Mono', monospace",
            fontSize:      9,
            color:         "#5A5A5A",
            background:    "transparent",
            border:        "none",
            cursor:        "pointer",
            textDecoration:"underline",
            letterSpacing: "0.1em",
            textAlign:     "center",
          }}
        >
          Changer de document
        </button>
      )}
    </div>
  );
}
