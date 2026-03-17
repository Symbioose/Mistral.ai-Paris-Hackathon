"use client";

import { useState, useRef } from "react";

const MAX_WORDS = 100;

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

interface TextInputProps {
  onSubmit: (text: string) => void;
  disabled: boolean;
}

export default function TextInput({ onSubmit, disabled }: TextInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const wordCount = countWords(text);
  const isOverLimit = wordCount > MAX_WORDS;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed && !isOverLimit) {
      onSubmit(trimmed);
      setText("");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", maxWidth: 420 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          disabled={disabled}
          placeholder="Tapez votre réponse..."
          aria-label="Saisir votre réponse"
          style={{
            flex: 1,
            padding: "10px 14px",
            fontFamily: "'Space Mono', monospace",
            fontSize: 14,
            color: isOverLimit ? "#cc0000" : "#1A1A1A",
            background: disabled ? "#e8e5da" : "#F3F0E6",
            border: `3px solid ${isOverLimit ? "#cc0000" : "#1A1A1A"}`,
            borderRadius: 0,
            boxShadow: "3px 3px 0 #1A1A1A",
            outline: "none",
            opacity: disabled ? 0.55 : 1,
            cursor: disabled ? "not-allowed" : "text",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim() || isOverLimit}
          aria-label="Envoyer la réponse"
          style={{
            padding: "10px 18px",
            fontFamily: "'Space Mono', monospace",
            fontSize: 13,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: disabled || !text.trim() || isOverLimit ? "#999" : "#F3F0E6",
            background: disabled || !text.trim() || isOverLimit ? "#ccc" : "#FF5B22",
            border: "3px solid #1A1A1A",
            borderRadius: 0,
            boxShadow: disabled || !text.trim() || isOverLimit ? "none" : "3px 3px 0 #1A1A1A",
            cursor: disabled || !text.trim() || isOverLimit ? "not-allowed" : "pointer",
            transition: "all 0.1s ease",
            whiteSpace: "nowrap",
          }}
        >
          Envoyer
        </button>
      </div>
      {wordCount > 0 && (
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: isOverLimit ? "#cc0000" : "rgba(255,255,255,0.45)",
            textAlign: "right",
            paddingRight: 4,
          }}
        >
          {wordCount}/{MAX_WORDS} mots
        </span>
      )}
    </div>
  );
}
