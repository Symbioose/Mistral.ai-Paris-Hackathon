"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { DocumentChunk, CopilotMessage } from "@/app/lib/types";

interface ChatPanelProps {
  trainingId: string;
  trainingTitle: string;
  onHighlightChunk: (chunk: { startChar: number; endChar: number } | null) => void;
  onBack: () => void;
}

/**
 * Parse assistant message content to extract [chunk_X] references
 * and render them as clickable links.
 */
function renderMessageContent(
  content: string,
  sources: DocumentChunk[],
  onClickChunk: (chunk: DocumentChunk) => void,
) {
  // Match [chunk_X] patterns
  const parts = content.split(/(\[chunk_\d+\])/g);

  return parts.map((part, i) => {
    const match = part.match(/^\[chunk_(\d+)\]$/);
    if (match) {
      const chunkIndex = parseInt(match[1], 10);
      const chunk = sources.find((s) => s.chunk_index === chunkIndex);
      if (chunk) {
        return (
          <button
            key={i}
            onClick={() => onClickChunk(chunk)}
            style={{
              display: "inline",
              background: "rgba(255, 91, 34, 0.1)",
              color: "#FF5B22",
              border: "1px solid rgba(255, 91, 34, 0.3)",
              borderRadius: 4,
              padding: "1px 6px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'Space Mono', monospace",
              transition: "all 0.15s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "rgba(255, 91, 34, 0.2)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "rgba(255, 91, 34, 0.1)";
            }}
            title="Voir dans le document"
          >
            📄 Source {chunkIndex + 1}
          </button>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ChatPanel({ trainingId, trainingTitle, onHighlightChunk, onBack }: ChatPanelProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: CopilotMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Build history from existing messages (without sources, limited to last 10)
    const history = [...messages, userMessage]
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`/api/copilot/${trainingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let sources: DocumentChunk[] = [];
      let assistantContent = "";

      // Add placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "", sources: [] }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "sources") {
              sources = event.chunks;
            } else if (event.type === "delta") {
              assistantContent += event.delta;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  sources,
                };
                return updated;
              });
            } else if (event.type === "done") {
              assistantContent = event.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  sources,
                };
                return updated;
              });
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Une erreur est survenue.",
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClickChunk = (chunk: DocumentChunk) => {
    onHighlightChunk({ startChar: chunk.start_char, endChar: chunk.end_char });
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--corp-bg)",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid var(--corp-border)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "white",
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid var(--corp-border)",
            background: "transparent",
            cursor: "pointer",
            color: "var(--corp-text-secondary)",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--corp-navy)",
          }}>
            Copilote
          </div>
          <div style={{
            fontSize: 12,
            color: "var(--corp-text-muted)",
            marginTop: 1,
          }}>
            {trainingTitle}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflow: "auto",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}>
        {messages.length === 0 && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: 12,
            color: "var(--corp-text-muted)",
            textAlign: "center" as const,
            padding: "40px 20px",
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <div style={{ fontSize: 14, maxWidth: 300 }}>
              Posez une question sur le contenu de la formation. Je citerai les passages exacts du document.
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div style={{
              maxWidth: "85%",
              padding: "12px 16px",
              borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: msg.role === "user" ? "var(--corp-blue)" : "white",
              color: msg.role === "user" ? "white" : "var(--corp-navy)",
              fontSize: 14,
              lineHeight: 1.6,
              border: msg.role === "assistant" ? "1px solid var(--corp-border)" : "none",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              whiteSpace: "pre-wrap",
            }}>
              {msg.role === "assistant" && msg.sources
                ? renderMessageContent(msg.content, msg.sources, handleClickChunk)
                : msg.content}
              {msg.role === "assistant" && msg.content === "" && isLoading && (
                <div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--corp-text-muted)", animation: "corp-pulse-soft 1s ease-in-out infinite" }} />
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--corp-text-muted)", animation: "corp-pulse-soft 1s ease-in-out infinite", animationDelay: "0.15s" }} />
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--corp-text-muted)", animation: "corp-pulse-soft 1s ease-in-out infinite", animationDelay: "0.3s" }} />
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "16px 20px",
        borderTop: "1px solid var(--corp-border)",
        background: "white",
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Posez votre question sur la formation..."
            rows={1}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--corp-border)",
              background: "var(--corp-bg)",
              fontSize: 14,
              fontFamily: "var(--corp-font-body)",
              color: "var(--corp-navy)",
              resize: "none",
              outline: "none",
              lineHeight: 1.5,
              maxHeight: 120,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              border: "none",
              background: (!input.trim() || isLoading) ? "var(--corp-border)" : "var(--corp-blue)",
              color: "white",
              cursor: (!input.trim() || isLoading) ? "not-allowed" : "pointer",
              flexShrink: 0,
              transition: "background 0.15s ease",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
