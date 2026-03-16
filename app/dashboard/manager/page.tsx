"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { useRouter } from "next/navigation";
import TrainingCard, { type Training } from "@/app/components/dashboard/TrainingCard";
import CreateTrainingModal from "@/app/components/dashboard/CreateTrainingModal";
import TrainingAnalyticsModal from "@/app/components/dashboard/TrainingAnalyticsModal";
import EmptyState from "@/app/components/dashboard/EmptyState";

export default function ManagerDashboard() {
  const { profile, isManager } = useAuth();
  const router = useRouter();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [analyticsTraining, setAnalyticsTraining] = useState<Training | null>(null);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const fetchTrainings = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/trainings");
      if (!res.ok) {
        setError("Impossible de charger les formations");
        return;
      }
      const data = await res.json();
      setTrainings(data.trainings || []);
    } catch {
      setError("Impossible de charger les formations");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrainings();
  }, [fetchTrainings]);

  // Poll for trainings in "processing" state (AI generating game plan)
  useEffect(() => {
    const hasProcessing = trainings.some((t) => t.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(() => fetchTrainings(), 4000);
    return () => clearInterval(interval);
  }, [trainings, fetchTrainings]);

  const handlePublish = async (training: Training) => {
    if (!training.status) return;

    try {
      setError(null);
      setActionLoading((prev) => ({ ...prev, [training.id]: "publishing" }));

      // Fire the publish request (takes 10-30s for AI generation)
      const publishPromise = fetch(`/api/trainings/${training.id}/publish`, {
        method: "POST",
      });

      // After 1s, refresh to show "processing" status on the card
      setTimeout(() => fetchTrainings(), 1000);

      const res = await publishPromise;
      if (res.ok) {
        fetchTrainings();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Échec de la publication");
        fetchTrainings(); // Refresh to show reverted "draft" status
      }
    } catch {
      setError("Échec de la publication");
      fetchTrainings();
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[training.id];
        return next;
      });
    }
  };

  const handleAnalytics = (training: Training) => setAnalyticsTraining(training);

  const handleTest = (training: Training) => {
    // Navigate to game with this training's document
    router.push(`/?training=${training.id}`);
  };

  const handleDelete = async (training: Training) => {
    if (deleteConfirm !== training.id) {
      setDeleteConfirm(training.id);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }

    try {
      setError(null);
      setActionLoading((prev) => ({ ...prev, [training.id]: "deleting" }));
      const res = await fetch(`/api/trainings/${training.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setTrainings((prev) => prev.filter((t) => t.id !== training.id));
      } else {
        setError("Échec de la suppression");
      }
    } catch {
      setError("Échec de la suppression");
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[training.id];
        return next;
      });
      setDeleteConfirm(null);
    }
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bonjour";
    if (hour < 18) return "Bon après-midi";
    return "Bonsoir";
  };

  const publishedCount = trainings.filter((t) => t.status === "published").length;
  const totalStudents = trainings.reduce((sum, t) => sum + (t.enrollments?.[0]?.count ?? 0), 0);

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
            {greeting()}, {profile?.full_name?.split(" ")[0] || "Manager"}
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
            {trainings.length === 0
              ? "Commencez par créer votre première formation."
              : `${publishedCount} formation${publishedCount !== 1 ? "s" : ""} active${publishedCount !== 1 ? "s" : ""} · ${totalStudents} apprenant${totalStudents !== 1 ? "s" : ""}`}
          </motion.p>
        </div>

        <motion.button
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsModalOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 24px",
            borderRadius: 10,
            border: "none",
            background: "var(--corp-blue)",
            color: "white",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--corp-font-body)",
            boxShadow: "0 4px 12px -2px rgba(37,99,235,0.2)",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nouvelle formation
        </motion.button>
      </motion.div>

      {/* Stats bar */}
      {trainings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
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
              value: trainings.length,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--corp-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20" />
                </svg>
              ),
            },
            {
              label: "Publiées",
              value: publishedCount,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              ),
            },
            {
              label: "Apprenants",
              value: totalStudents,
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87" />
                  <path d="M16 3.13a4 4 0 010 7.75" />
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

      {/* Error banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          style={{
            marginBottom: 20,
            padding: "12px 20px",
            borderRadius: 10,
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 14, color: "#DC2626", fontWeight: 500 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: "none", border: "none",
              color: "#DC2626", cursor: "pointer",
              fontSize: 16, padding: 4, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </motion.div>
      )}

      {/* Content */}
      {isLoading ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(360, 1fr))",
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
      ) : trainings.length === 0 ? (
        <EmptyState onCreateClick={() => setIsModalOpen(true)} />
      ) : (
        <motion.div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
            gap: 20,
          }}
        >
          {trainings.map((training, i) => (
            <TrainingCard
              key={training.id}
              training={training}
              index={i}
              onTest={handleTest}
              onPublish={handlePublish}
              onDelete={handleDelete}
              onAnalytics={handleAnalytics}
              loadingAction={actionLoading[training.id]}
            />
          ))}
        </motion.div>
      )}

      {/* Delete confirmation toast */}
      {deleteConfirm && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--corp-navy)",
            color: "white",
            padding: "12px 24px",
            borderRadius: 12,
            fontSize: 14,
            fontFamily: "var(--corp-font-body)",
            boxShadow: "0 8px 24px -4px rgba(15,28,63,0.3)",
            zIndex: 100,
          }}
        >
          Cliquez à nouveau sur Supprimer pour confirmer
        </motion.div>
      )}

      {/* Create modal */}
      <CreateTrainingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={fetchTrainings}
      />

      {/* Analytics modal */}
      <TrainingAnalyticsModal
        isOpen={!!analyticsTraining}
        onClose={() => setAnalyticsTraining(null)}
        training={analyticsTraining}
      />
    </div>
  );
}
