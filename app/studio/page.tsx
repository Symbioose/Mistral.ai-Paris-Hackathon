"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/providers/AuthProvider";
import { Header } from "@/app/components/simulation/Workspace";
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
  const [tab, setTab] = useState<"edit" | "preview" | "cohort">("edit");
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
  return (
    <div className="yg-shell">
      <Header right={<Link href="/simulation">Espace d’entraînement ↗</Link>} />
      <main className="yg-studio">
        <div className="yg-eyebrow">STUDIO PÉDAGOGIQUE</div>
        <h1>
          Les bonnes conditions
          <br />
          <em>pour progresser.</em>
        </h1>
        {loading ? (
          <p>Chargement…</p>
        ) : !isManager ? (
          <p>
            Connectez-vous avec un compte formateur pour préparer les
            entretiens.
          </p>
        ) : (
          <>
            <p className="yg-lead">
              Scénario, persona, référence et rubrique : le contenu est entre
              vos mains.
            </p>
            <div className="yg-studio-toolbar">
              <select
                aria-label="Scénario à modifier"
                value={id || ""}
                onChange={(e) => {
                  const draft = drafts.find((d) => d.id === e.target.value);
                  setId(draft?.id);
                  if (draft)
                    setSource(JSON.stringify(draft.draft_config, null, 2));
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
                className="yg-link"
                onClick={() => {
                  setId(undefined);
                  setNotice(
                    "Le contenu actuel servira de base au nouveau scénario. Modifiez son titre puis enregistrez.",
                  );
                }}
              >
                Dupliquer
              </button>
              <button
                className="yg-link"
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
              <label className="yg-link">
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
                      setNotice(
                        "Import chargé. Enregistrez le brouillon pour le conserver.",
                      );
                    } catch {
                      setError("Ce fichier ne contient pas de JSON valide.");
                    }
                  }}
                />
              </label>
            </div>
            <div className="yg-tabs">
              <button
                aria-pressed={tab === "edit"}
                onClick={() => setTab("edit")}
              >
                Éditer le contenu
              </button>
              <button
                aria-pressed={tab === "preview"}
                onClick={() => setTab("preview")}
              >
                Aperçu du brief
              </button>
              <button
                aria-pressed={tab === "cohort"}
                onClick={() => setTab("cohort")}
              >
                Parcours des apprenants
              </button>
            </div>
            {tab === "cohort" ? (
              <TrainerProgress />
            ) : tab === "preview" ? (
              <section className="yg-paper">
                <span className="yg-kicker">CE QUE VERRA L’APPRENANT</span>
                <h2>{String(parsed?.title || "")}</h2>
                <p>{String(parsed?.brief || "")}</p>
                <hr />
                <strong>{String(parsed?.personaName || "")}</strong>
                <p>{String(parsed?.personaRole || "")}</p>
                <p className="yg-small">
                  Les faits privés, la référence et les consignes du juge
                  restent réservés au serveur.
                </p>
              </section>
            ) : (
              <div className="yg-studio-columns">
                <section className="yg-paper">
                  <span className="yg-kicker">LE CADRE DE L’ENTRETIEN</span>
                  {[
                    ["title", "Titre"],
                    ["brief", "Brief apprenant"],
                    ["personaName", "Nom du client"],
                    ["personaRole", "Rôle du client"],
                  ].map(([key, label]) => (
                    <label className="yg-field" key={key}>
                      {label}
                      <textarea
                        rows={key === "brief" ? 5 : 2}
                        disabled={!parsed}
                        value={String(parsed?.[key] || "")}
                        onChange={(e) => field(key, e.target.value)}
                      />
                    </label>
                  ))}
                  <div className="yg-advice">
                    <strong>Avant de publier</strong>
                    <p>
                      La grille de démonstration est provisoire. Calibrez ses
                      niveaux avec vos annotations avant d’interpréter les
                      scores comme une mesure validée.
                    </p>
                  </div>
                </section>
                <section className="yg-paper">
                  <span className="yg-kicker">
                    CONFIGURATION COMPLÈTE · JSON
                  </span>
                  <p className="yg-small">
                    Modifiez les faits privés, les modules, la conversation de
                    référence, les critères et le prompt du juge. Les
                    identifiants de compétences doivent rester stables.
                  </p>
                  <textarea
                    className="yg-json"
                    aria-label="Configuration JSON du scénario"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    spellCheck={false}
                  />
                  {!parsed && source && (
                    <p className="yg-error">
                      JSON invalide : vérifiez les virgules et guillemets.
                    </p>
                  )}
                </section>
              </div>
            )}
            {error && (
              <p className="yg-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="yg-notice" role="status">
                {notice}
              </p>
            )}
            <div className="yg-studio-actions">
              <button
                className="yg-button yg-button-soft"
                disabled={busy || !parsed}
                onClick={() => save("save")}
              >
                Enregistrer le brouillon
              </button>
              <button
                className="yg-button"
                disabled={busy || !parsed}
                onClick={() => save("publish")}
              >
                {busy ? "Enregistrement…" : "Publier une nouvelle version"} ↗
              </button>
            </div>
            <StudioEvaluation source={source} fixtures={fixtures} />
          </>
        )}
      </main>
    </div>
  );
}
