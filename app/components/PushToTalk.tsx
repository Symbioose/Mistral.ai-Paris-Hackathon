"use client";

import { useCallback, useRef, useState } from "react";

interface PushToTalkProps {
  onSpeechResult: (text: string) => void;
  disabled: boolean;
}

export default function PushToTalk({ onSpeechResult, disabled }: PushToTalkProps) {
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
    setTranscript("");
  }, [disabled]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    if (transcript.trim()) {
      onSpeechResult(transcript.trim());
      setTranscript("");
    }
  }, [transcript, onSpeechResult]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {/* Transcript preview */}
      {isRecording && transcript && (
        <div
          style={{
            padding:    "6px 16px",
            background: "#1A1A1A",
            border:     "2px solid #FF5B22",
            maxWidth:   360,
          }}
        >
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#FF5B22", fontStyle: "italic" }}>
            &quot;{transcript}&quot;
          </p>
        </div>
      )}

      {/* PTT Button */}
      <div style={{ position: "relative" }}>
        {/* Pulse rings */}
        {isRecording && (
          <>
            <div
              className="animate-pulse-ring"
              style={{
                position: "absolute", inset: -12,
                border: "3px solid #FF5B22",
                pointerEvents: "none",
              }}
            />
            <div
              className="animate-pulse-ring"
              style={{
                position: "absolute", inset: -24,
                border: "2px solid #FF5B22",
                pointerEvents: "none",
                animationDelay: "0.3s",
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
            width:      80,
            height:     80,
            background: disabled ? "#C4C0B5" : isRecording ? "#FF5B22" : "#1A1A1A",
            border:     `4px solid ${isRecording ? "#FF5B22" : "#1A1A1A"}`,
            boxShadow:  disabled ? "none" : `4px 4px 0 ${isRecording ? "#CC4919" : "#FF5B22"}`,
            display:    "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor:     disabled ? "not-allowed" : "pointer",
            transition: "all 0.15s",
            transform:  isRecording ? "scale(1.08)" : "scale(1)",
            userSelect: "none",
          }}
        >
          <svg
            style={{ width: 32, height: 32, color: isRecording ? "#1A1A1A" : disabled ? "#5A5A5A" : "#F3F0E6" }}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="square" strokeLinejoin="miter"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        </button>

        {/* Sound bars */}
        {isRecording && (
          <div style={{ position: "absolute", right: -36, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "flex-end", gap: 3, height: 28 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-soundwave"
                style={{
                  width:           4,
                  height:          "100%",
                  background:      "#FF5B22",
                  animationDelay:  `${i * 100}ms`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <span
        style={{
          fontFamily:    "'Space Mono', monospace",
          fontSize:      9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color:         isRecording ? "#FF5B22" : disabled ? "#C4C0B5" : "#5A5A5A",
          fontWeight:    700,
        }}
      >
        {disabled ? "En attente..." : isRecording ? "Relachez pour envoyer" : "Maintenir pour parler"}
      </span>
    </div>
  );
}
