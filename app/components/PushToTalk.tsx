"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDeepgramSTT } from "@/app/hooks/useDeepgramSTT";

interface PushToTalkProps {
  onSpeechResult: (text: string) => void;
  disabled: boolean;
  onRecordingChange?: (isRecording: boolean) => void;
}

export default function PushToTalk({
  onSpeechResult,
  disabled,
  onRecordingChange,
}: PushToTalkProps) {
  const { isRecording, transcript, startRecordingWithStream, stopRecording } =
    useDeepgramSTT({ language: "fr" });

  // Optimistic visual state — activates immediately on press, before WebSocket opens.
  // isRecording (from hook) activates later once ws.onopen fires.
  const [isPressed, setIsPressed] = useState(false);
  const isActive = isPressed || isRecording;

  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  // Notify parent when recording state changes
  const prevRecordingRef = useRef(false);
  useEffect(() => {
    if (prevRecordingRef.current !== isRecording) {
      prevRecordingRef.current = isRecording;
      onRecordingChange?.(isRecording);
    }
  }, [isRecording, onRecordingChange]);

  // Called directly from onMouseDown / onTouchStart.
  // Safari requires getUserMedia() to be invoked synchronously in the same
  // execution frame as the user gesture — no async/await before the call.
  const handleStart = useCallback(() => {
    if (disabled) return;
    setIsPressed(true);

    // getUserMedia must be called synchronously from the user gesture (Safari requirement).
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      .then((stream) => startRecordingWithStream(stream))
      .catch((err) => {
        console.error("[PushToTalk] Microphone access denied:", err);
        setIsPressed(false);
      });
  }, [disabled, startRecordingWithStream]);

  const handleStop = useCallback(() => {
    setIsPressed(false);
    stopRecording();
    const finalText = transcriptRef.current.trim();
    if (finalText) {
      onSpeechResult(finalText);
    }
  }, [stopRecording, onSpeechResult]);

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        gap:           10,
      }}
    >
      {/* Transcript preview */}
      {isActive && transcript && (
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
          <p
            style={{
              fontFamily: "var(--corp-font-body)",
              fontSize:   12,
              color:      "rgba(255,255,255,0.7)",
              fontStyle:  "italic",
            }}
          >
            &quot;{transcript}&quot;
          </p>
        </div>
      )}

      {/* PTT Button */}
      <div
        style={{ position: "relative", display: "flex", alignItems: "center" }}
      >
        {/* Pulse rings */}
        {isActive && (
          <>
            <div
              className="animate-pulse-ring"
              style={{
                position:      "absolute",
                inset:         -10,
                border:        "2px solid rgba(59,130,246,0.45)",
                borderRadius:  "50%",
                pointerEvents: "none",
              }}
            />
            <div
              className="animate-pulse-ring"
              style={{
                position:       "absolute",
                inset:          -20,
                border:         "1px solid rgba(139,92,246,0.2)",
                borderRadius:   "50%",
                pointerEvents:  "none",
                animationDelay: "0.35s",
              }}
            />
          </>
        )}

        <button
          onMouseDown={handleStart}
          onMouseUp={handleStop}
          onMouseLeave={() => isRecording && handleStop()}
          onTouchStart={(e) => {
            e.preventDefault();
            handleStart();
          }}
          onTouchEnd={handleStop}
          disabled={disabled}
          style={{
            width:          80,
            height:         80,
            borderRadius:   "50%",
            background:     disabled
              ? "rgba(255,255,255,0.03)"
              : isActive
              ? "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)"
              : "linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(139,92,246,0.10) 100%)",
            border: `2px solid ${
              disabled
                ? "rgba(255,255,255,0.08)"
                : isActive
                ? "#3B82F6"
                : "rgba(59,130,246,0.4)"
            }`,
            boxShadow: isActive
              ? "0 0 30px rgba(59,130,246,0.5), 0 0 60px rgba(139,92,246,0.2), inset 0 1px 0 rgba(255,255,255,0.15)"
              : "0 0 0 1px rgba(59,130,246,0.1), 0 4px 12px rgba(0,0,0,0.3)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            cursor:         disabled ? "not-allowed" : "pointer",
            transition:     "all 0.15s ease",
            transform:      isActive ? "scale(1.08)" : "scale(1)",
            userSelect:     "none",
          }}
        >
          <svg
            style={{
              width:  28,
              height: 28,
              color:  disabled
                ? "rgba(255,255,255,0.15)"
                : isActive
                ? "#ffffff"
                : "rgba(59,130,246,0.85)",
            }}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.75}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        </button>

        {/* Sound bars */}
        {isActive && (
          <div
            style={{
              position:  "absolute",
              right:     -32,
              top:       "50%",
              transform: "translateY(-50%)",
              display:   "flex",
              alignItems: "center",
              gap:        3,
              height:     24,
            }}
          >
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
          color:         isActive
            ? "#3B82F6"
            : disabled
            ? "rgba(255,255,255,0.25)"
            : "rgba(255,255,255,0.45)",
        }}
      >
        {disabled
          ? "En attente..."
          : isActive
          ? "Relâchez pour envoyer"
          : "Maintenir pour parler"}
      </span>
    </div>
  );
}
