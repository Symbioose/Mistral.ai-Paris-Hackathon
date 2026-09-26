"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/providers/AuthProvider";
import { Arrow, Footer, TopBar } from "@/app/components/simulation/Chrome";

const STEPS = [
  ["01", "Vous menez l’entretien", "Face à un client joué par une IA, à la voix."],
  ["02", "Il ne dit pas tout", "Le besoin se découvre question après question."],
  ["03", "Vous recevez un retour", "Précis, cité mot pour mot, jamais humiliant."],
];

export default function Home() {
  const { signIn, isAuthenticated, profile, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
      router.push("/simulation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="yg-app">
      <TopBar />
      <main className="yg-page">
        <div className="yg-landing">
          <section className="yg-landing-copy">
            <p className="yg-kicker yg-reveal">
              <span className="yg-dot yg-dot--live" /> Simulateur d’entretien client
            </p>
            <h1 className="yg-display yg-reveal">
              Le client parle.
              <br />
              <em>À vous de comprendre.</em>
            </h1>
            <p className="yg-lead yg-reveal">
              Entraînez-vous à conduire un entretien de découverte avec un
              client virtuel qui vous répond à voix haute. Posez vos questions,
              prenez le temps : ici, on a le droit de se tromper.
            </p>
            <ol className="yg-steps yg-reveal">
              {STEPS.map(([n, title, text]) => (
                <li key={n}>
                  <span>{n}</span>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="yg-reveal" aria-label="Connexion">
            <div className="yg-preview" aria-hidden="true">
              <div className="yg-preview-bar">
                <span>
                  <span className="yg-dot yg-dot--live" /> En cours · 02:41
                </span>
                <span>Camille Martin</span>
              </div>
              <div className="yg-preview-head" />
              <q>Honnêtement, ce qui m’inquiète, c’est lundi matin.</q>
              <div className="yg-preview-wave">
                {Array.from({ length: 28 }, (_, i) => (
                  <i key={i} style={{ animationDelay: `${(i * 97) % 900}ms` }} />
                ))}
              </div>
            </div>
            <div className="yg-login">
              {isAuthenticated ? (
                <>
                  <div className="yg-login-head">
                    <p className="yg-kicker">Bon retour</p>
                    <h2 className="yg-title">
                      {profile?.full_name?.split(" ")[0] || "Bonjour"}, votre
                      prochain entretien vous attend.
                    </h2>
                  </div>
                  <Link className="yg-btn yg-btn--signal yg-btn--lg yg-btn--block" href="/simulation">
                    Reprendre l’entraînement <Arrow />
                  </Link>
                </>
              ) : (
                <>
                  <div className="yg-login-head">
                    <p className="yg-kicker">Espace participant</p>
                    <h2 className="yg-title">Entrer dans la salle.</h2>
                    <p className="yg-small">
                      Utilisez les identifiants transmis par votre formateur.
                    </p>
                  </div>
                  <form onSubmit={submit}>
                    <label className="yg-field">
                      Adresse e-mail
                      <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    </label>
                    <label className="yg-field">
                      Mot de passe
                      <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                    </label>
                    {error && (
                      <p className="yg-alert" role="alert">
                        {error}
                      </p>
                    )}
                    <button className="yg-btn yg-btn--signal yg-btn--lg yg-btn--block" disabled={busy || loading}>
                      {busy ? "Connexion…" : <>Se connecter <Arrow /></>}
                    </button>
                  </form>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
