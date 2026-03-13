"use client";

import { useEffect, useRef, useState } from "react";

interface DialogueBoxProps {
  text: string;
  isLoading: boolean;
  speakerName?: string;
  speakerType?: "narrator" | "npc";
}

export default function DialogueBox({ text, isLoading, speakerName = "Maître du Jeu", speakerType = "narrator" }: DialogueBoxProps) {
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTextRef = useRef("");

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!text) {
      lastTextRef.current = "";
      setDisplayText("");
      setIsTyping(false);
      return;
    }

    const previous = lastTextRef.current;
    const isStreamingAppend = text.startsWith(previous) && text.length >= previous.length;
    lastTextRef.current = text;

    // During token streaming, avoid restarting typewriter every render.
    if (isStreamingAppend) {
      setDisplayText(text);
      setIsTyping(false);
      return;
    }

    setIsTyping(true);
    setDisplayText("");
    let index = 0;
    intervalRef.current = setInterval(() => {
      if (index < text.length) {
        setDisplayText(text.slice(0, index + 1));
        index++;
      } else {
        setIsTyping(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 20);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [text]);

  const isNpc = speakerType === "npc";

  return (
    <div className="relative">
      <div
        style={{
          background: "rgba(31,35,48,0.7)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          backdropFilter: "blur(8px)",
          borderLeft: "3px solid #3B82F6",
          borderRadius: 12,
          margin: "0 16px 12px",
          padding: "16px 24px",
        }}
      >
        {/* Speaker label */}
        <div className="flex items-center gap-2 mb-3">
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: isNpc ? "#3B82F6" : "rgba(255,255,255,0.3)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 12,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: isNpc ? "#FFFFFF" : "rgba(255,255,255,0.7)",
              fontWeight: 600,
            }}
          >
            {speakerName}
          </span>
          {isNpc && (
            <span
              style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 10,
                color: "#3B82F6",
                border: "1px solid rgba(59,130,246,0.3)",
                padding: "2px 8px",
                borderRadius: 100,
                letterSpacing: "0.06em",
              }}
            >
              PNJ
            </span>
          )}
        </div>

        {/* Text */}
        <div style={{ minHeight: 56 }}>
          {isLoading ? (
            <div className="flex items-end gap-1" style={{ height: 20 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="animate-soundwave"
                  style={{
                    width:            3,
                    height:           16,
                    background:       "#3B82F6",
                    animationDelay:   `${i * 80}ms`,
                    transformOrigin:  "bottom",
                  }}
                />
              ))}
              <span
                style={{
                  fontFamily: "var(--corp-font-body)",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.50)",
                  marginLeft: 8,
                }}
              >
                Analyse en cours...
              </span>
            </div>
          ) : (
            <p
              style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 18,
                lineHeight: 1.65,
                color: "rgba(255,255,255,0.95)",
              }}
            >
              {displayText}
              {isTyping && (
                <span
                  className="animate-blink"
                  style={{ display: "inline-block", width: 2, height: "1em", background: "#3B82F6", marginLeft: 2, verticalAlign: "text-bottom" }}
                />
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
