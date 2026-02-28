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
          background:   "#1A1A1A",
          borderTop:    "4px solid #FF5B22",
          padding:      "16px 24px 20px",
        }}
      >
        {/* Speaker label */}
        <div className="flex items-center gap-2 mb-3">
          <div
            style={{
              width:      8,
              height:     8,
              background: isNpc ? "#FF5B22" : "#1A1A1A",
              border:     isNpc ? "2px solid #FF5B22" : "2px solid #F3F0E6",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily:    "'Space Mono', monospace",
              fontSize:      10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color:         isNpc ? "#FF5B22" : "#F3F0E6",
              fontWeight:    700,
            }}
          >
            {speakerName}
          </span>
          {isNpc && (
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize:   9,
                color:      "#FF5B22",
                border:     "1px solid #FF5B22",
                padding:    "1px 4px",
                letterSpacing: "0.1em",
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
                    background:       "#FF5B22",
                    animationDelay:   `${i * 80}ms`,
                    transformOrigin:  "bottom",
                  }}
                />
              ))}
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize:   11,
                  color:      "#5A5A5A",
                  marginLeft: 8,
                  letterSpacing: "0.1em",
                }}
              >
                TRANSMISSION EN COURS...
              </span>
            </div>
          ) : (
            <p
              className="animate-flicker"
              style={{
                fontFamily:  "'VT323', monospace",
                fontSize:    22,
                lineHeight:  1.4,
                color:       "#F3F0E6",
                letterSpacing: "0.02em",
              }}
            >
              {displayText}
              {isTyping && (
                <span
                  className="animate-blink"
                  style={{ display: "inline-block", width: 10, height: 18, background: "#FF5B22", marginLeft: 2, verticalAlign: "middle" }}
                />
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
