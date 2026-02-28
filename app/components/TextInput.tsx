"use client";

import { useState, useRef } from "react";

interface TextInputProps {
  onSubmit: (text: string) => void;
  disabled: boolean;
}

export default function TextInput({ onSubmit, disabled }: TextInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
      setText("");
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-md">
      <div className="w-full flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={disabled}
          placeholder="Que fais-tu ?"
          className="
            flex-1 px-4 py-2.5 rounded-lg
            bg-zinc-900/80 backdrop-blur
            border border-cyan-500/30
            text-zinc-200 placeholder-zinc-600
            focus:border-cyan-400/60 focus:outline-none focus:shadow-lg focus:shadow-cyan-500/10
            disabled:opacity-50 disabled:cursor-not-allowed
            font-mono text-sm
          "
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="
            px-4 py-2.5 rounded-lg font-mono text-sm uppercase tracking-wider
            bg-cyan-500/10 border border-cyan-500/30 text-cyan-300
            hover:bg-cyan-500/20 hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/10
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-300 active:scale-95
          "
        >
          Envoyer
        </button>
      </div>
      <span className="text-[10px] font-mono text-zinc-600">Mode texte (mic non disponible)</span>
    </div>
  );
}
