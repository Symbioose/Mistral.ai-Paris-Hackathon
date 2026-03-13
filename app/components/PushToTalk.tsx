"use client";

import { useCallback, useRef, useState } from "react";

interface PushToTalkProps {
  onSpeechResult: (text: string) => void;
  disabled: boolean;
  onRecordingChange?: (isRecording: boolean) => void;
}

export default function PushToTalk({ onSpeechResult, disabled, onRecordingChange }: PushToTalkProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const startRecording = useCallback(() => {
    if (disabled) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Reconnaissance vocale non supportée. Utilisez Chrome.");
      return;
    }
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (event: { results: { isFinal: boolean; [key: number]: { transcript: string } }[] }) => {
      let final = "", interim = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      setTranscript(final || interim);
    };

    rec.onerror = (e: { error: string }) => {
      console.error("Speech recognition error:", e.error);
      setIsRecording(false);
    };

    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
    onRecordingChange?.(true);
    setTranscript("");
  }, [disabled, onRecordingChange]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    onRecordingChange?.(false);
    if (transcript.trim()) {
      onSpeechResult(transcript.trim());
      setTranscript("");
    }
  }, [transcript, onSpeechResult, onRecordingChange]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      {/* Transcript preview */}
      {isRecording && transcript && (
        <div
          style={{
            padding:      "6px 14px",
            background:   "rgba(59,130,246,0.10)",
            border:       "1px solid rgba(59,130,246,0.25)",
            borderLeft:   "3px solid #3B82F6",
            borderRadius: 8,
            maxWidth:     320,
          }}
        >
          <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "rgba(255,255,255,0.7)", fontStyle: "italic" }}>
            &quot;{transcript}&quot;
          </p>
        </div>
      )}

      {/* PTT Button */}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {/* Pulse rings */}
        {isRecording && (
          <>
            <div
              className="animate-pulse-ring"
              style={{
                position:     "absolute",
                inset:        -10,
                border:       "2px solid rgba(59,130,246,0.45)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />
            <div
              className="animate-pulse-ring"
              style={{
                position:     "absolute",
                inset:        -20,
                border:       "1px solid rgba(139,92,246,0.2)",
                borderRadius: "50%",
                pointerEvents: "none",
                animationDelay: "0.35s",
              }}
            />
          </>
        )}

        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={() => isRecording && stopRecording()}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          disabled={disabled}
          style={{
            width:          80,
            height:         80,
            borderRadius:   "50%",
            background:     disabled
              ? "rgba(255,255,255,0.03)"
              : isRecording
              ? "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)"
              : "linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(139,92,246,0.10) 100%)",
            border:         `2px solid ${
              disabled ? "rgba(255,255,255,0.08)" : isRecording ? "#3B82F6" : "rgba(59,130,246,0.4)"
            }`,
            boxShadow:      isRecording
              ? "0 0 30px rgba(59,130,246,0.5), 0 0 60px rgba(139,92,246,0.2), inset 0 1px 0 rgba(255,255,255,0.15)"
              : "0 0 0 1px rgba(59,130,246,0.1), 0 4px 12px rgba(0,0,0,0.3)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            cursor:         disabled ? "not-allowed" : "pointer",
            transition:     "all 0.15s ease",
            transform:      isRecording ? "scale(1.08)" : "scale(1)",
            userSelect:     "none",
          }}
        >
          <svg
            style={{
              width:  28,
              height: 28,
              color:  disabled
                ? "rgba(255,255,255,0.15)"
                : isRecording
                ? "#ffffff"
                : "rgba(59,130,246,0.85)",
            }}
            fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        </button>

        {/* Sound bars */}
        {isRecording && (
          <div style={{ position: "absolute", right: -32, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 3, height: 24 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-soundwave"
                style={{
                  width:          3,
                  height:         "100%",
                  background:     i % 2 === 0 ? "#3B82F6" : "#8B5CF6",
                  borderRadius:   2,
                  animationDelay: `${i * 100}ms`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <span
        style={{
          fontFamily:    "var(--corp-font-body)",
          fontSize:      10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight:    500,
          color:         isRecording
            ? "#3B82F6"
            : disabled
            ? "rgba(255,255,255,0.25)"
            : "rgba(255,255,255,0.45)",
        }}
      >
        {disabled ? "En attente..." : isRecording ? "Relâchez pour envoyer" : "Maintenir pour parler"}
      </span>
    </div>
  );
}
