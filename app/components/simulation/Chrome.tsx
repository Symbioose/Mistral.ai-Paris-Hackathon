"use client";
import Link from "next/link";
import { useAuth } from "@/app/providers/AuthProvider";

/** Top bar shared by every simulator page. `stage` switches it to the dark interview theme. */
export function TopBar({
  current,
  stage = false,
  onHome,
}: {
  current?: "training" | "studio";
  stage?: boolean;
  onHome?: () => void;
}) {
  const { profile, isAuthenticated, isManager, signOut } = useAuth();
  const initials = (profile?.full_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <header className={`yg-top ${stage ? "yg-top--stage" : ""}`}>
      <Link href="/" className="yg-brand" aria-label="YouGotIt, accueil">
        <span className="yg-brand-mark" aria-hidden="true" />
        YouGotIt
        <small>Entretien client</small>
      </Link>
      {isAuthenticated && (
        <nav className="yg-nav" aria-label="Navigation principale">
          <Link
            href="/simulation"
            aria-current={current === "training" ? "page" : undefined}
            onClick={(e) => {
              if (onHome) {
                e.preventDefault();
                onHome();
              }
            }}
          >
            Entraînement
          </Link>
          {isManager && (
            <Link
              href="/studio"
              aria-current={current === "studio" ? "page" : undefined}
            >
              Studio
            </Link>
          )}
          <button
            onClick={() => void signOut()}
            title="Se déconnecter"
            aria-label={`Se déconnecter (${profile?.full_name || "compte"})`}
          >
            <span className="yg-hide-sm">Déconnexion</span>
            <span className="yg-avatar-chip" aria-hidden="true">
              {initials}
            </span>
          </button>
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="yg-footer">
      <span>YouGotIt · Simulateur d’entretien client</span>
      <span>EPITA Executive Education · 2026–2027</span>
    </footer>
  );
}

export const Arrow = () => (
  <svg className="yg-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

export const MicIcon = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="9" y="2.5" width="6" height="12" rx="3" />
    <path d="M5.5 10.5v1a6.5 6.5 0 0013 0v-1M12 18.5V22" />
  </svg>
);

export const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
