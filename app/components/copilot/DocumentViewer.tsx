"use client";

import { useEffect, useRef, useMemo } from "react";

interface HighlightRange {
  startChar: number;
  endChar: number;
}

interface DocumentViewerProps {
  documentText: string;
  highlight: HighlightRange | null;
}

export default function DocumentViewer({ documentText, highlight }: DocumentViewerProps) {
  const highlightRef = useRef<HTMLSpanElement>(null);

  // Scroll to highlighted passage when highlight changes
  useEffect(() => {
    if (highlight && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight]);

  // Split text into segments: before, highlighted, after
  const segments = useMemo(() => {
    if (!highlight) {
      return [{ text: documentText, isHighlight: false }];
    }

    const { startChar, endChar } = highlight;
    const before = documentText.slice(0, startChar);
    const highlighted = documentText.slice(startChar, endChar);
    const after = documentText.slice(endChar);

    return [
      { text: before, isHighlight: false },
      { text: highlighted, isHighlight: true },
      { text: after, isHighlight: false },
    ].filter((s) => s.text.length > 0);
  }, [documentText, highlight]);

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: "24px",
        fontFamily: "var(--corp-font-body)",
        fontSize: 14,
        lineHeight: 1.8,
        color: "var(--corp-text-secondary)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: "var(--corp-text-muted)",
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: "1px solid var(--corp-border-light)",
      }}>
        Document source
      </div>
      <div>
        {segments.map((seg, i) =>
          seg.isHighlight ? (
            <span
              key={i}
              ref={highlightRef}
              style={{
                background: "rgba(255, 91, 34, 0.15)",
                borderLeft: "3px solid #FF5B22",
                padding: "2px 4px",
                borderRadius: 2,
                transition: "background 0.3s ease",
              }}
            >
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </div>
    </div>
  );
}
