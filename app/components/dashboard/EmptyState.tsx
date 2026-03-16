"use client";

import { motion } from "framer-motion";

interface EmptyStateProps {
  onCreateClick: () => void;
}

export default function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 24px",
        textAlign: "center" as const,
      }}
    >
      {/* Illustration */}
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          width: 120,
          height: 120,
          borderRadius: 28,
          background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(139,92,246,0.06))",
          border: "1px solid var(--corp-border-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 32,
          position: "relative",
        }}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--corp-blue)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
          <path d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20" />
          <path d="M12 7v6" />
          <path d="M9 10h6" />
        </svg>
        {/* Decorative dots */}
        <div style={{
          position: "absolute",
          top: -6,
          right: -6,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "var(--corp-blue)",
          opacity: 0.15,
        }} />
        <div style={{
          position: "absolute",
          bottom: -4,
          left: -4,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--corp-blue)",
          opacity: 0.1,
        }} />
      </motion.div>

      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        style={{
          fontFamily: "var(--corp-font-heading)",
          fontSize: 28,
          fontWeight: 400,
          color: "var(--corp-navy)",
          margin: "0 0 12px",
        }}
      >
        Aucune formation
      </motion.h3>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        style={{
          fontSize: 15,
          color: "var(--corp-text-secondary)",
          lineHeight: 1.6,
          maxWidth: 400,
          margin: "0 0 32px",
        }}
      >
        Importez un document de formation et transformez-le
        en simulation immersive pour vos équipes.
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        whileHover={{ scale: 1.02, boxShadow: "0 12px 24px -6px rgba(37,99,235,0.25)" }}
        whileTap={{ scale: 0.98 }}
        onClick={onCreateClick}
        style={{
          background: "var(--corp-blue)",
          color: "white",
          fontFamily: "var(--corp-font-body)",
          fontSize: 15,
          fontWeight: 600,
          padding: "14px 32px",
          border: "none",
          borderRadius: 12,
          cursor: "pointer",
          boxShadow: "0 4px 12px -2px rgba(37,99,235,0.2)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Créer ma première formation
      </motion.button>
    </motion.div>
  );
}
