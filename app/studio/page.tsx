"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/providers/AuthProvider";
import { Arrow, Footer, TopBar, initialsOf } from "@/app/components/simulation/Chrome";
import { api } from "@/app/lib/conversation/types";
import StudioEvaluation from "@/app/components/simulation/StudioEvaluation";
import TrainerProgress from "@/app/components/simulation/TrainerProgress";
interface Draft {
  id: string;
  draft_config: Record<string, unknown>;
  published_version_id: string | null;
}
export default function Studio() {
  const { isManager, loading } = useAuth();
  const [fixtures, setFixtures] = useState<
    { id: string; moduleNumber: number }[]
  >([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [source, setSource] = useState("");
  const [id, setId] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"edit" | "json" | "preview" | "test" | "cohort">("edit");
  const load = useCallback(async (initial = false) => {
    try {
      const data = await api<{
        scenarios: Draft[];
        demoConfig: Record<string, unknown>;
        fixtures: { id: string; moduleNumber: number }[];
      }>("/api/simulation/admin");
      setDrafts(data.scenarios);
      setFixtures(data.fixtures);
      if (initial) {
        setSource(
          JSON.stringify(
            data.scenarios[0]?.draft_config || data.demoConfig,
            null,
            2,
          ),
        );
        setId(data.scenarios[0]?.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, []);
  useEffect(() => {
    if (isManager) void load(true);
  }, [isManager, load]);
  const save = async (action: "save" | "publish") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const config = JSON.parse(source);
      const result = await api<{ scenarioId: string }>(
        "/api/simulation/admin",
        { action, scenarioId: id, config },
      );
      setId(result.scenarioId);
      setNotice(
        action === "publish"
          ? "Version publiée. Les nouvelles sessions utiliseront ce contenu. Les entretiens précédents sont conservés."
          : "Brouillon enregistré.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(source);
  } catch {}
  const field = (key: string, value: string) => {
    if (parsed) setSource(JSON.stringify({ ...parsed, [key]: value }, null, 2));
  };
  const title = String(parsed?.title || "Sans titre");
  const published = drafts.find((d) => d.id === id)?.published_version_id;
  const SECTIONS: [typeof tab, string, string][] = [
    ["edit", "Cadre de l’entretien", "01"],
    ["json", "Configuration complète", "02"],
    ["preview", "Aperçu apprenant", "03"],
    ["test", "Tester l’évaluation", "04"],
    ["cohort", "Suivi des apprenants", "05"],
  ];
  return (
    <div className="yg-app">
      <TopBar current="studio" />
      <main className="yg-page">
        <div className="yg-hello">
          <div style={{ display: "grid", gap: 14 }}>
            <p className="yg-kicker">Studio pédagogique</p>
            <h1 className="yg-title">
              Le contenu est <em>entre vos mains.</em>
            </h1>
            <p className="yg-lead">
              Scénario, persona, faits cachés, rubrique et prompt du juge : tout se modifie ici, sans
              déploiement. Chaque publication crée une version figée ; les entretiens passés ne changent pas.
            </p>
          </div>
        </div>
        {loading ? (
          <p className="yg-loading">Chargement…</p>
        ) : !isManager ? (
          <div className="yg-empty" style={{ marginTop: 32 }}>
            <h2 className="yg-h3">Accès réservé aux formateurs.</h2>
            <p className="yg-small">Connectez-vous avec un compte formateur pour préparer les entretiens.</p>
            <div>
              <Link className="yg-btn" href="/simulation">
                Retour à l’entraînement <Arrow />
              </Link>
            </div>
          </div>
        ) : (
          <div className="yg-studio">
            <nav className="yg-side" aria-label="Sections du studio">
              {SECTIONS.map(([key, label, n]) => (
                <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
                  {label}
                  <span>{n}</span>
                </button>
              ))}
              <hr />
              <p className="yg-small">
                {published ? "Version publiée · les nouvelles sessions utilisent la dernière publication." : "Brouillon non publié."}
              </p>
            </nav>

            <div>
              <section className="yg-panel">
                <div className="yg-panel-head yg-panel-head--tools">
                  <div>
                    <p className="yg-kicker">Scénario</p>
                    <h2 className="yg-h3">{title}</h2>
                  </div>
                  <div className="yg-toolbar">
                    <select
                      aria-label="Scénario à modifier"
                      value={id || ""}
                      onChange={(e) => {
                        const draft = drafts.find((d) => d.id === e.target.value);
                        setId(draft?.id);
                        if (draft) setSource(JSON.stringify(draft.draft_config, null, 2));
                      }}
                    >
                      <option value="">Nouveau scénario</option>
                      {drafts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {String(d.draft_config.title)}
                        </option>
                      ))}
                    </select>
                    <button
                      className="yg-btn yg-btn--ghost"
                      onClick={() => {
                        setId(undefined);
                        setNotice("Copie prête : modifiez son titre puis enregistrez-la comme nouveau scénario.");
                      }}
                    >
                      Dupliquer
                    </button>
                    <button
                      className="yg-btn yg-btn--ghost"
                      onClick={() => {
                        const blob = new Blob([source], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "scenario-yougotit.json";
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Exporter
                    </button>
                    <label className="yg-btn yg-btn--ghost" style={{ position: "relative" }}>
                      Importer
                      <input
                        className="yg-file-input"
                        type="file"
                        accept=".json,application/json"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 150000) {
                            setError("Fichier trop volumineux.");
                            return;
                          }
                          try {
                            const value = JSON.parse(await file.text());
                            setSource(JSON.stringify(value, null, 2));
                            setId(undefined);
                            setNotice("Import chargé. Enregistrez le brouillon pour le conserver.");
                          } catch {
                            setError("Ce fichier ne contient pas de JSON valide.");
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
                {error && <p className="yg-alert" role="alert">{error}</p>}
                {notice && <p className="yg-notice" role="status">{notice}</p>}
              </section>

              {tab === "edit" && (
                <section className="yg-panel">
                  <div className="yg-panel-head">
                    <div>
                      <p className="yg-kicker">01 · Cadre de l’entretien</p>
                      <h2 className="yg-h3">Ce que l’apprenant voit avant d’entrer</h2>
                    </div>
                  </div>
                  <div className="yg-grid-2">
                    {[
                      ["title", "Titre", 2, true],
                      ["personaName", "Nom de l’interlocuteur", 1, false],
                      ["personaRole", "Fonction", 1, false],
                      ["brief", "Brief apprenant", 5, true],
                    ].map(([key, label, rows, wide]) => (
                      <label className={`yg-field ${wide ? "yg-field--wide" : ""}`} key={String(key)}>
                        {label}
                        <textarea
                          rows={Number(rows)}
                          disabled={!parsed}
                          value={String(parsed?.[String(key)] || "")}
                          onChange={(e) => field(String(key), e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="yg-small">
                    Faits cachés, modules, rubrique et prompt du juge se modifient dans la configuration complète.
                    Les identifiants de compétences doivent rester stables pour comparer la progression.
                  </p>
                </section>
              )}

              {tab === "json" && (
                <section className="yg-panel">
                  <div className="yg-panel-head">
                    <div>
                      <p className="yg-kicker">02 · Configuration complète</p>
                      <h2 className="yg-h3">Persona, faits cachés, modules, rubrique, juge</h2>
                    </div>
                    <span className="yg-status">
                      <span className={`yg-dot ${parsed ? "yg-dot--ok" : ""}`} />
                      {parsed ? "JSON valide" : "JSON invalide"}
                    </span>
                  </div>
                  <label className="yg-field">
                    Configuration JSON
                    <textarea className="yg-json" value={source} onChange={(e) => setSource(e.target.value)} spellCheck={false} />
                  </label>
                </section>
              )}

              {tab === "preview" && (
                <section className="yg-panel">
                  <div className="yg-panel-head">
                    <div>
                      <p className="yg-kicker">03 · Aperçu apprenant</p>
                      <h2 className="yg-h3">La carte telle qu’elle apparaîtra</h2>
                    </div>
                  </div>
                  <div className="yg-preview-card">
                    <figure className="yg-mission-stage">
                      <span className="yg-monogram" aria-hidden="true">
                        {initialsOf(String(parsed?.personaName || "?"))}
                      </span>
                      <figcaption>
                        <strong>{String(parsed?.personaName || "")}</strong>
                        <span>{String(parsed?.personaRole || "")}</span>
                      </figcaption>
                    </figure>
                    <div>
                      <p className="yg-kicker">Entretien de découverte</p>
                      <h3 className="yg-title" style={{ fontSize: 30 }}>{title}</h3>
                      <p>{String(parsed?.brief || "")}</p>
                    </div>
                  </div>
                  <p className="yg-small">
                    Les faits cachés, la référence et les consignes du juge restent sur le serveur : l’apprenant ne les voit jamais.
                  </p>
                </section>
              )}

              {tab === "test" && <StudioEvaluation source={source} fixtures={fixtures} />}
              {tab === "cohort" && <TrainerProgress />}

              {tab !== "cohort" && (
                <div className="yg-publish">
                  <p>{parsed ? "Publier crée une nouvelle version figée." : "Corrigez le JSON avant d’enregistrer."}</p>
                  <div className="yg-toolbar">
                    <button className="yg-btn yg-btn--ghost" disabled={busy || !parsed} onClick={() => save("save")}>
                      Enregistrer le brouillon
                    </button>
                    <button className="yg-btn yg-btn--signal" disabled={busy || !parsed} onClick={() => save("publish")}>
                      {busy ? "Enregistrement…" : <>Publier <Arrow /></>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
