"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { useRouter } from "next/navigation";
import EnrollmentCard, { type Enrollment } from "@/app/components/dashboard/EnrollmentCard";

export default function StudentDashboard() {
  const { profile } = useAuth();
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState(false);

  // Auto-dismiss join error after 5 seconds
  useEffect(() => {
    if (!joinError) return;
    const timer = setTimeout(() => setJoinError(null), 5000);
    return () => clearTimeout(timer);
  }, [joinError]);

  // Auto-dismiss join success after 2 seconds
  useEffect(() => {
    if (!joinSuccess) return;
    const timer = setTimeout(() => setJoinSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [joinSuccess]);

  const fetchEnrollments = useCallback(async () => {
    try {
      const res = await fetch("/api/trainings");
      if (!res.ok) return;
      const data = await res.json();
      setEnrollments(data.enrollments || []);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  const handleJoin = async () => {
    if (joinCode.length < 6) return;
    setJoinLoading(true);
    setJoinError(null);
    setJoinSuccess(false);
    try {
      const res = await fetch("/api/trainings/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: joinCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJoinCode("");
      setJoinSuccess(true);
      fetchEnrollments();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Code invalide");
    } finally {
      setJoinLoading(false);
    }
  };

  const handlePlay = (enrollment: Enrollment) => {
    router.push(`/?training=${enrollment.trainings.id}&enrollment=${enrollment.id}`);
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bonjour";
    if (hour < 18) return "Bon après-midi";
    return "Bonsoir";
  };

  const completedCount = enrollments.filter((e) => e.status === "completed").length;
  const inProgressCount = enrollments.filter((e) => e.status === "in_progress").length;

  return (
    <div style={{ padding: "0 48px 48px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "40px 0 32px",
        }}
      >
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 36,
              fontWeight: 400,
              color: "var(--corp-navy)",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {greeting()}, {profile?.full_name?.split(" ")[0] || "Apprenant"}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            style={{
              fontSize: 15,
              color: "var(--corp-text-secondary)",
              margin: "8px 0 0",
            }}
          >
            {enrollments.length === 0
              ? "Commencez par rejoindre une formation avec un code."
              : `${enrollments.length} formation${enrollments.length !== 1 ? "s" : ""} · ${completedCount} terminée${completedCount !== 1 ? "s" : ""} · ${inProgressCount} en cours`}
          </motion.p>
        </div>
      </motion.div>

      {/* Join code section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        style={{
          background: "white",
          borderRadius: 14,
          border: "1px solid var(--corp-border)",
          padding: "24px",
          marginBottom: 32,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 280 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "var(--corp-bg-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--corp-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </div>
          <div>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--corp-navy)",
              marginBottom: 2,
            }}>
              Rejoindre une formation
            </div>
            <div style={{
              fontSize: 12,
              color: "var(--corp-text-muted)",
            }}>
              Entrez le code fourni par votre responsable
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
            placeholder="ABC123"
            maxLength={6}
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 20,
              width: 160,
              padding: "10px 16px",
              border: `2px solid ${joinError ? "var(--corp-danger)" : joinSuccess ? "#059669" : "var(--corp-border)"}`,
              borderRadius: 10,
              background: "var(--corp-bg)",
              outline: "none",
              boxSizing: "border-box",
              color: "var(--corp-navy)",
              letterSpacing: "0.2em",
              textAlign: "center" as const,
              fontWeight: 700,
              transition: "border-color 0.2s ease",
            }}
          />
          <button
            disabled={joinCode.length < 6 || joinLoading}
            onClick={handleJoin}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: (joinCode.length < 6 || joinLoading) ? "var(--corp-border)" : "var(--corp-blue)",
              color: (joinCode.length < 6 || joinLoading) ? "var(--corp-text-muted)" : "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: (joinCode.length < 6 || joinLoading) ? "not-allowed" : "pointer",
              fontFamily: "var(--corp-font-body)",
              transition: "all 0.15s ease",
              flexShrink: 0,
            }}
          >
            {joinLoading ? (
              <div style={{
                width: 14, height: 14,
                border: "2px solid rgba(255,255,255,0.3)",
                borderTop: "2px solid white",
                borderRadius: "50%",
                animation: "corp-spinner 0.6s linear infinite",
              }} />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 16 12 12 8 16" />
                <line x1="12" y1="12" x2="12" y2="21" />
                <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
              </svg>
            )}
            Rejoindre
          </button>
        </div>

        {/* Feedback */}
        {joinError && (
          <div style={{ width: "100%", fontSize: 13, color: "var(--corp-danger)", fontWeight: 500, marginTop: -4 }}>
            {joinError}
          </div>
        )}
        {joinSuccess && (
          <div style={{ width: "100%", fontSize: 13, color: "#059669", fontWeight: 500, marginTop: -4 }}>
            Formation rejointe avec succès !
          </div>
        )}
      </motion.div>

      {/* Stats bar */}
      {enrollments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          data-stats-grid
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
            marginBottom: 32,
          }}
        >
          {[
            {
              label: "Formations",
              value: enrollments.length,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--corp-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20" />
                </svg>
              ),
            },
            {
              label: "En cours",
              value: inProgressCount,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              ),
            },
            {
              label: "Terminées",
              value: completedCount,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              ),
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 + i * 0.05 }}
              style={{
                background: "white",
                borderRadius: 14,
                border: "1px solid var(--corp-border)",
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "var(--corp-bg-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                {stat.icon}
              </div>
              <div>
                <div style={{
                  fontSize: 28,
                  fontWeight: 600,
                  color: "var(--corp-navy)",
                  lineHeight: 1,
                  fontFamily: "var(--corp-font-body)",
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontSize: 13,
                  color: "var(--corp-text-muted)",
                  marginTop: 4,
                }}>
                  {stat.label}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Content */}
      {isLoading ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
          gap: 20,
        }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                background: "white",
                borderRadius: 16,
                border: "1px solid var(--corp-border-light)",
                height: 220,
                animation: "corp-pulse-soft 1.5s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      ) : enrollments.length === 0 ? (
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
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--corp-blue)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
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
              margin: 0,
            }}
          >
            Entrez un code de formation dans le champ ci-dessus
            pour rejoindre votre première session.
          </motion.p>
        </motion.div>
      ) : (
        <motion.div
          data-cards-grid
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
            gap: 20,
          }}
        >
          {enrollments.map((enrollment, i) => (
            <EnrollmentCard
              key={enrollment.id}
              enrollment={enrollment}
              index={i}
              onPlay={handlePlay}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}
