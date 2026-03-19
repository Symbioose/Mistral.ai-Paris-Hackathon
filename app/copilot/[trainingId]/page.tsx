"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ChatPanel from "@/app/components/copilot/ChatPanel";
import DocumentViewer from "@/app/components/copilot/DocumentViewer";

interface TrainingData {
  id: string;
  title: string;
  document_text: string;
}

export default function CopilotPage() {
  const params = useParams();
  const router = useRouter();
  const trainingId = params.trainingId as string;

  const [training, setTraining] = useState<TrainingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{ startChar: number; endChar: number } | null>(null);

  useEffect(() => {
    async function fetchTraining() {
      try {
        const res = await fetch(`/api/trainings/${trainingId}`);
        if (!res.ok) {
          setError("Formation introuvable ou accès refusé");
          return;
        }
        const data = await res.json();
        setTraining({
          id: data.training.id,
          title: data.training.title,
          document_text: data.training.document_text,
        });
      } catch {
        setError("Erreur de chargement");
      } finally {
        setIsLoading(false);
      }
    }
    fetchTraining();
  }, [trainingId]);

  const handleBack = useCallback(() => {
    router.push("/dashboard/student");
  }, [router]);

  if (isLoading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "calc(100vh - 64px)",
        color: "var(--corp-text-muted)",
        fontSize: 14,
      }}>
        Chargement...
      </div>
    );
  }

  if (error || !training) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "calc(100vh - 64px)",
        gap: 16,
      }}>
        <div style={{ color: "var(--corp-text-muted)", fontSize: 14 }}>
          {error || "Formation introuvable"}
        </div>
        <button
          onClick={handleBack}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid var(--corp-border)",
            background: "white",
            cursor: "pointer",
            fontSize: 13,
            color: "var(--corp-navy)",
          }}
        >
          Retour au dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      height: "calc(100vh - 64px)",
      overflow: "hidden",
    }}>
      {/* Chat Panel — left side */}
      <div style={{
        width: "50%",
        minWidth: 380,
        borderRight: "1px solid var(--corp-border)",
        flexShrink: 0,
      }}>
        <ChatPanel
          trainingId={trainingId}
          trainingTitle={training.title}
          onHighlightChunk={setHighlight}
          onBack={handleBack}
        />
      </div>

      {/* Document Viewer — right side */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <DocumentViewer
          documentText={training.document_text}
          highlight={highlight}
        />
      </div>
    </div>
  );
}
