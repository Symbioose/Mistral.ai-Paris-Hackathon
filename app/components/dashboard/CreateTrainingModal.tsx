"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useRef, useState } from "react";

interface CreateTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type UploadStep = "form" | "uploading" | "success" | "error";

export default function CreateTrainingModal({ isOpen, onClose, onCreated }: CreateTrainingModalProps) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<UploadStep>("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle("");
    setFile(null);
    setStep("form");
    setErrorMessage("");
    setProgress(0);
  };

  const handleClose = () => {
    if (step === "uploading") return; // Don't close while uploading
    resetForm();
    onClose();
  };

  const handleFile = (f: File) => {
    const validTypes = ["application/pdf", "text/plain"];
    if (!validTypes.includes(f.type)) {
      setErrorMessage("Format non supporté. Utilisez un PDF ou un fichier texte.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setErrorMessage("Fichier trop volumineux (max 10 MB).");
      return;
    }
    setErrorMessage("");
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleSubmit = async () => {
    if (!title.trim() || !file) return;

    setStep("uploading");
    setProgress(10);

    try {
      // Step 1: Extract text from file
      const extractForm = new FormData();
      extractForm.append("file", file);
      setProgress(25);

      const extractRes = await fetch("/api/upload", {
        method: "POST",
        body: extractForm,
      });

      if (!extractRes.ok) {
        const data = await extractRes.json();
        throw new Error(data.error || "Erreur lors de l'extraction du texte");
      }

      const { text: documentText } = await extractRes.json();
      setProgress(50);

      // Step 2: Create training with extracted text + file
      const createForm = new FormData();
      createForm.append("title", title.trim());
      createForm.append("documentText", documentText);
      createForm.append("file", file);
      setProgress(40);

      const createRes = await fetch("/api/trainings/create", {
        method: "POST",
        body: createForm,
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        throw new Error(data.error || "Erreur lors de la création");
      }

      const { training: createdTraining } = await createRes.json();

      // Step 3: Publish (AI generation)
      setProgress(50);
      const publishRes = await fetch(`/api/trainings/${createdTraining.id}/publish`, { method: "POST" });
      if (!publishRes.ok) {
        const errData = await publishRes.json().catch(() => ({}));
        throw new Error(errData.error || "Échec de la publication");
      }

      setProgress(100);
      setStep("success");

      // Auto-close after success
      setTimeout(() => {
        handleClose();
        onCreated();
      }, 1500);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Une erreur est survenue");
      setStep("error");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,28,63,0.4)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            fontFamily: "var(--corp-font-body)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 20,
              width: 520,
              maxWidth: "90vw",
              maxHeight: "90vh",
              overflow: "hidden",
              boxShadow: "0 24px 48px -12px rgba(15,28,63,0.2)",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "28px 32px 0",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}>
              <div>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.08em",
                  color: "var(--corp-blue)",
                  marginBottom: 8,
                }}>
                  Nouvelle formation
                </div>
                <h2 style={{
                  fontFamily: "var(--corp-font-heading)",
                  fontSize: 26,
                  fontWeight: 400,
                  color: "var(--corp-navy)",
                  margin: 0,
                }}>
                  Créer une formation
                </h2>
              </div>
              <button
                onClick={handleClose}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  color: "var(--corp-text-muted)",
                  cursor: "pointer",
                  padding: 4,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  transition: "background 0.15s",
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = "var(--corp-bg-subtle)"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "none"; }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "24px 32px 32px" }}>
              {step === "success" ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "40px 0",
                    gap: 16,
                  }}
                >
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "rgba(5,150,105,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 500, color: "var(--corp-navy)", margin: 0 }}>
                    Formation publiée !
                  </p>
                </motion.div>
              ) : step === "error" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{
                    padding: 16,
                    borderRadius: 12,
                    background: "rgba(220,38,38,0.04)",
                    border: "1px solid rgba(220,38,38,0.15)",
                  }}>
                    <p style={{ fontSize: 14, color: "var(--corp-danger)", margin: 0, lineHeight: 1.6 }}>
                      {errorMessage}
                    </p>
                  </div>
                  <button
                    onClick={() => setStep("form")}
                    style={{
                      width: "100%",
                      padding: 14,
                      borderRadius: 10,
                      border: "none",
                      background: "var(--corp-blue)",
                      color: "white",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "var(--corp-font-body)",
                    }}
                  >
                    Réessayer
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {/* Title input */}
                  <div>
                    <label style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--corp-text-secondary)",
                      marginBottom: 8,
                    }}>
                      Titre de la formation
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="ex: Onboarding commercial Q1 2026"
                      disabled={step === "uploading"}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        borderRadius: 10,
                        border: "1px solid var(--corp-border)",
                        background: "var(--corp-bg-subtle)",
                        fontSize: 14,
                        color: "var(--corp-text)",
                        outline: "none",
                        fontFamily: "var(--corp-font-body)",
                        boxSizing: "border-box",
                        transition: "border-color 0.15s",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--corp-blue)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--corp-border)"; }}
                    />
                  </div>

                  {/* File drop zone */}
                  <div>
                    <label style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--corp-text-secondary)",
                      marginBottom: 8,
                    }}>
                      Document source
                    </label>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        padding: file ? "16px 20px" : "40px 20px",
                        borderRadius: 12,
                        border: `2px dashed ${isDragging ? "var(--corp-blue)" : file ? "var(--corp-success)" : "var(--corp-border)"}`,
                        background: isDragging ? "rgba(37,99,235,0.04)" : file ? "rgba(5,150,105,0.03)" : "var(--corp-bg-subtle)",
                        cursor: step === "uploading" ? "default" : "pointer",
                        textAlign: "center" as const,
                        transition: "all 0.2s ease",
                        pointerEvents: step === "uploading" ? "none" : "auto",
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.txt"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFile(f);
                        }}
                        style={{ display: "none" }}
                      />
                      {file ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: "rgba(5,150,105,0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          </div>
                          <div style={{ textAlign: "left" as const, flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--corp-navy)" }}>
                              {file.name}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--corp-text-muted)", marginTop: 2 }}>
                              {(file.size / 1024).toFixed(0)} Ko
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setFile(null); }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--corp-text-muted)",
                              cursor: "pointer",
                              padding: 4,
                              fontSize: 16,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <div style={{
                            width: 48,
                            height: 48,
                            borderRadius: 12,
                            background: "rgba(37,99,235,0.08)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 12px",
                          }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--corp-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="16 16 12 12 8 16" />
                              <line x1="12" y1="12" x2="12" y2="21" />
                              <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
                            </svg>
                          </div>
                          <p style={{ fontSize: 14, color: "var(--corp-text-secondary)", margin: "0 0 4px" }}>
                            Glissez votre fichier ici ou <span style={{ color: "var(--corp-blue)", fontWeight: 500 }}>parcourir</span>
                          </p>
                          <p style={{ fontSize: 12, color: "var(--corp-text-muted)", margin: 0 }}>
                            PDF ou TXT — 10 MB max
                          </p>
                        </>
                      )}
                    </div>
                    {errorMessage && step === "form" && (
                      <p style={{ fontSize: 13, color: "var(--corp-danger)", marginTop: 8 }}>{errorMessage}</p>
                    )}
                  </div>

                  {/* Progress bar (during upload) */}
                  {step === "uploading" && (
                    <div>
                      <div style={{
                        height: 4,
                        borderRadius: 2,
                        background: "var(--corp-border-light)",
                        overflow: "hidden",
                      }}>
                        <motion.div
                          initial={{ width: "0%" }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.4 }}
                          style={{
                            height: "100%",
                            borderRadius: 2,
                            background: "var(--corp-blue)",
                          }}
                        />
                      </div>
                      <p style={{
                        fontSize: 13,
                        color: "var(--corp-text-muted)",
                        textAlign: "center" as const,
                        marginTop: 12,
                      }}>
                        {progress < 40 ? "Extraction du contenu..." : progress < 60 ? "Création de la formation..." : "Publication en cours..."}
                      </p>
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    onClick={handleSubmit}
                    disabled={!title.trim() || !file || step === "uploading"}
                    style={{
                      width: "100%",
                      padding: 14,
                      borderRadius: 10,
                      border: "none",
                      background: (!title.trim() || !file || step === "uploading")
                        ? "var(--corp-border)"
                        : "var(--corp-blue)",
                      color: (!title.trim() || !file || step === "uploading")
                        ? "var(--corp-text-muted)"
                        : "white",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: (!title.trim() || !file || step === "uploading")
                        ? "not-allowed"
                        : "pointer",
                      fontFamily: "var(--corp-font-body)",
                      transition: "all 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    {step === "uploading" ? (
                      <>
                        <div style={{
                          width: 16, height: 16,
                          border: "2px solid rgba(255,255,255,0.3)",
                          borderTop: "2px solid white",
                          borderRadius: "50%",
                          animation: "corp-spinner 0.8s linear infinite",
                        }} />
                        Publication en cours...
                      </>
                    ) : (
                      "Publier la formation →"
                    )}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
