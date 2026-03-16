"use client";

import { motion } from "framer-motion";
import { useAuth } from "@/app/providers/AuthProvider";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const BOOK_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20" />
  </svg>
);

const MANAGER_NAV_ITEMS = [
  { label: "Formations", href: "/dashboard/manager", icon: BOOK_ICON },
];

const STUDENT_NAV_ITEMS = [
  { label: "Mes formations", href: "/dashboard/student", icon: BOOK_ICON },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, isAuthenticated, isManager, isStudent, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarHovered, setSidebarHovered] = useState(false);

  useEffect(() => {
    // Only redirect if auth has fully loaded AND user is definitely not a manager
    // profile===null with isAuthenticated===true means profile is still loading
    if (!loading && !isAuthenticated) {
      router.replace("/");
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--corp-bg-subtle)",
        fontFamily: "var(--corp-font-body)",
      }}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
        >
          <div style={{
            width: 40, height: 40,
            border: "3px solid var(--corp-border)",
            borderTop: "3px solid var(--corp-blue)",
            borderRadius: "50%",
            animation: "corp-spinner 0.8s linear infinite",
          }} />
          <span style={{ fontSize: 14, color: "var(--corp-text-muted)" }}>Chargement...</span>
        </motion.div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--corp-bg-subtle)",
        fontFamily: "var(--corp-font-body)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 40, height: 40,
            border: "3px solid var(--corp-border)",
            borderTop: "3px solid var(--corp-blue)",
            borderRadius: "50%",
            animation: "corp-spinner 0.8s linear infinite",
          }} />
          <span style={{ fontSize: 14, color: "var(--corp-text-muted)" }}>Redirection...</span>
        </div>
      </div>
    );
  }

  if (!isManager && !isStudent) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--corp-bg-subtle)",
        fontFamily: "var(--corp-font-body)",
      }}>
        <div style={{
          background: "white",
          borderRadius: 16,
          border: "1px solid var(--corp-border)",
          padding: "48px 40px",
          textAlign: "center" as const,
          maxWidth: 400,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <h2 style={{
            fontFamily: "var(--corp-font-heading)",
            fontSize: 22,
            color: "var(--corp-navy)",
            margin: "0 0 8px",
          }}>
            Accès non autorisé
          </h2>
          <p style={{ fontSize: 14, color: "var(--corp-text-muted)", margin: "0 0 24px" }}>
            Vous n&apos;avez pas les permissions nécessaires pour accéder à cette section.
          </p>
          <button
            onClick={() => router.replace("/")}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              border: "none",
              background: "var(--corp-blue)",
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--corp-font-body)",
            }}
          >
            Retour à l&apos;accueil
          </button>
        </div>
      </div>
    );
  }

  const NAV_ITEMS = isManager ? MANAGER_NAV_ITEMS : STUDENT_NAV_ITEMS;

  const initials = (profile?.full_name || "M")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      overflow: "hidden",
      background: "var(--corp-bg-subtle)",
      fontFamily: "var(--corp-font-body)",
    }}>
      {/* Sidebar */}
      <motion.aside
        data-sidebar
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        animate={{ width: sidebarHovered ? 240 : 72 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          background: "var(--corp-navy)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{
          height: 72,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "var(--corp-blue)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <motion.span
            animate={{ opacity: sidebarHovered ? 1 : 0 }}
            transition={{ duration: 0.15 }}
            style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 20,
              color: "white",
              whiteSpace: "nowrap",
            }}
          >
            YouGotIt
          </motion.span>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: isActive ? "rgba(255,255,255,0.1)" : "transparent",
                  color: isActive ? "white" : "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  width: "100%",
                  textAlign: "left" as const,
                  fontFamily: "var(--corp-font-body)",
                  fontSize: 14,
                  fontWeight: isActive ? 500 : 400,
                  flexShrink: 0,
                }}
                onMouseOver={(e) => {
                  if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                }}
                onMouseOut={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
                <motion.span
                  animate={{ opacity: sidebarHovered ? 1 : 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ whiteSpace: "nowrap", overflow: "hidden" }}
                >
                  {item.label}
                </motion.span>
              </button>
            );
          })}
        </nav>

        {/* User section */}
        <div style={{
          padding: "16px 12px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "linear-gradient(135deg, #3B82F6, #8B5CF6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <motion.div
            animate={{ opacity: sidebarHovered ? 1 : 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: "hidden", whiteSpace: "nowrap", flex: 1 }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: "white", lineHeight: 1.3 }}>
              {profile?.full_name || (isManager ? "Manager" : "Étudiant")}
            </div>
            <button
              onClick={signOut}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.4)",
                fontSize: 12,
                cursor: "pointer",
                padding: 0,
                fontFamily: "var(--corp-font-body)",
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
              onMouseOut={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
            >
              Déconnexion
            </button>
          </motion.div>
        </div>
      </motion.aside>

      {/* Main content */}
      <main data-dashboard-content style={{
        flex: 1,
        overflow: "auto",
        background: "var(--corp-bg-subtle)",
      }}>
        {children}
      </main>
    </div>
  );
}
