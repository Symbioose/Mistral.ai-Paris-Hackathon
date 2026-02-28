import { NextRequest } from "next/server";
import { mistralChat } from "@/app/lib/agents/mistral-client";
import { ManagerAssessment, MultiAgentGameState, SimulationReport } from "@/app/lib/types";

type ReportRequest = {
  gameState: MultiAgentGameState;
  assessments?: ManagerAssessment[];
  documentFilename?: string | null;
  documentContext?: string | null;
  finalMessage?: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function toCriticality(weight: number): "low" | "medium" | "high" {
  if (weight >= 4) return "high";
  if (weight >= 2) return "medium";
  return "low";
}

function computeWeightedScore(scores: Array<{ score: number; weight: number }>): number {
  if (scores.length === 0) return 0;
  const totalWeight = scores.reduce((acc, s) => acc + (Number(s.weight) || 1), 0);
  if (totalWeight <= 0) return 0;
  const total = scores.reduce((acc, s) => acc + (Number(s.score) || 0) * (Number(s.weight) || 1), 0);
  return Math.round(total / totalWeight);
}

function buildFallbackReport(gameState: MultiAgentGameState, assessments: ManagerAssessment[]): SimulationReport {
  const skills = gameState.scores.map((s) => {
    const noteHits = assessments.filter((a) =>
      String(a.skillAssessed || "").toLowerCase().includes(s.topic.toLowerCase()),
    );

    return {
      id: s.topic.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "skill",
      name: s.topic,
      description: `Compétence évaluée dans la simulation: ${s.topic}.`,
      criticality: toCriticality(s.weight),
      evidences: [
        `Sujet issu de la grille d'évaluation: ${s.topic}`,
        ...noteHits.slice(0, 2).map((n) => n.managerNote).filter(Boolean),
      ].slice(0, 3),
      masteryScore: clamp(Math.round(s.score), 0, 100),
      confidence: 0.65,
      failurePatterns: noteHits.flatMap((n) => n.failurePatterns || []).slice(0, 3),
      attempts: Math.max(1, noteHits.length),
      lastManagerNote: noteHits[noteHits.length - 1]?.managerNote || "Pas de note spécifique.",
    };
  });

  const risk = (skill: (typeof skills)[number]) =>
    (100 - skill.masteryScore) *
    (skill.criticality === "high" ? 3 : skill.criticality === "medium" ? 2 : 1);

  const sortedGaps = [...skills].sort((a, b) => risk(b) - risk(a));

  const topCriticalGaps = sortedGaps.slice(0, 3).map((skill) => ({
    skillId: skill.id,
    skillName: skill.name,
    criticality: skill.criticality,
    masteryScore: skill.masteryScore,
    confidence: skill.confidence,
    failurePatterns: skill.failurePatterns,
    evidenceExcerpts: skill.evidences.slice(0, 2),
    managerNote: skill.lastManagerNote,
  }));

  const recommendations = sortedGaps.slice(0, 3).map((skill) => {
    const priority: "high" | "medium" | "low" =
      skill.criticality === "high"
        ? "high"
        : skill.criticality === "medium"
          ? "medium"
          : "low";
    return {
      skillId: skill.id,
      skillName: skill.name,
      priority,
      recommendation: `Rejouer un scénario centré sur "${skill.name}", puis valider par un cas pratique encadré dans la semaine.`,
    };
  });

  const decisionTrace = gameState.conversationHistory
    .reduce<Array<{ user?: string; assistant?: string }>>((acc, msg) => {
      if (msg.role === "user") {
        acc.push({ user: msg.content });
      } else if (msg.role === "assistant" && acc.length > 0) {
        const last = acc[acc.length - 1];
        if (!last.assistant) {
          last.assistant = msg.content;
        }
      }
      return acc;
    }, [])
    .slice(-5)
    .map((item, idx) => ({
      step: idx + 1,
      situation: "Décision en situation de pression opérationnelle.",
      playerDecision: String(item.user || ""),
      impact: String(item.assistant || "").slice(0, 180) || "Impact non capturé.",
      skillsInvolved: gameState.scores
        .slice(0, 2)
        .map((s) => s.topic),
    }));

  const totalScore = computeWeightedScore(gameState.scores);

  return {
    generatedAt: new Date().toISOString(),
    globalWeightedScore: totalScore,
    skills,
    topCriticalGaps,
    recommendations,
    executiveSummary:
      totalScore >= 75
        ? "Performance globalement solide avec quelques points de vigilance à consolider."
        : totalScore >= 55
          ? "Niveau intermédiaire: des acquis existent, mais plusieurs compétences critiques restent fragiles."
          : "Niveau insuffisant sur les points critiques: plan de remédiation prioritaire requis.",
    actionablePlan7Days: [
      "Jour 1: briefing manager de 20 minutes sur les 3 lacunes critiques.",
      "Jour 2-3: micro-sessions ciblées (15 minutes) sur les procédures non maîtrisées.",
      "Jour 4: simulation courte focalisée sur les compétences à risque élevé.",
      "Jour 5: debrief structuré avec preuves et erreurs récurrentes.",
      "Jour 6-7: nouvelle simulation de validation et décision de certification interne.",
    ],
    decisionTrace,
  };
}

function sanitizeReport(raw: unknown, fallback: SimulationReport): SimulationReport {
  if (!raw || typeof raw !== "object") return fallback;
  const data = raw as Record<string, unknown>;

  const topCriticalGaps = Array.isArray(data.topCriticalGaps)
    ? data.topCriticalGaps
        .map((g) => {
          const x = g as Record<string, unknown>;
          return {
            skillId: String(x.skillId || ""),
            skillName: String(x.skillName || ""),
            criticality: (["low", "medium", "high"].includes(String(x.criticality)) ? x.criticality : "medium") as "low" | "medium" | "high",
            masteryScore: clamp(Number(x.masteryScore || 0), 0, 100),
            confidence: clamp(Number(x.confidence || 0.6), 0, 1),
            failurePatterns: Array.isArray(x.failurePatterns) ? x.failurePatterns.map(String).slice(0, 5) : [],
            evidenceExcerpts: Array.isArray(x.evidenceExcerpts) ? x.evidenceExcerpts.map(String).slice(0, 3) : [],
            managerNote: String(x.managerNote || ""),
          };
        })
        .filter((g) => g.skillName)
    : fallback.topCriticalGaps;

  const recommendations = Array.isArray(data.recommendations)
    ? data.recommendations
        .map((r) => {
          const x = r as Record<string, unknown>;
          const priority = ["low", "medium", "high"].includes(String(x.priority)) ? String(x.priority) : "medium";
          return {
            skillId: String(x.skillId || ""),
            skillName: String(x.skillName || ""),
            recommendation: String(x.recommendation || ""),
            priority: priority as "low" | "medium" | "high",
          };
        })
        .filter((r) => r.skillName && r.recommendation)
    : fallback.recommendations;

  const actionablePlan7Days = Array.isArray(data.actionablePlan7Days)
    ? data.actionablePlan7Days.map(String).slice(0, 7)
    : fallback.actionablePlan7Days;

  const decisionTrace = Array.isArray(data.decisionTrace)
    ? data.decisionTrace
        .map((d, idx) => {
          const x = d as Record<string, unknown>;
          return {
            step: clamp(Number(x.step || idx + 1), 1, 20),
            situation: String(x.situation || ""),
            playerDecision: String(x.playerDecision || ""),
            impact: String(x.impact || ""),
            skillsInvolved: Array.isArray(x.skillsInvolved) ? x.skillsInvolved.map(String).slice(0, 4) : [],
          };
        })
        .filter((d) => d.playerDecision)
    : fallback.decisionTrace;

  return {
    ...fallback,
    globalWeightedScore: clamp(Number(data.globalWeightedScore || fallback.globalWeightedScore), 0, 100),
    executiveSummary: String(data.executiveSummary || fallback.executiveSummary || ""),
    topCriticalGaps: topCriticalGaps.length > 0 ? topCriticalGaps : fallback.topCriticalGaps,
    recommendations: recommendations.length > 0 ? recommendations : fallback.recommendations,
    actionablePlan7Days,
    decisionTrace,
    generatedAt: new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  let fallbackFromPayload: SimulationReport | null = null;
  try {
    const body = (await req.json()) as ReportRequest;
    const gameState = body?.gameState;

    if (!gameState || !Array.isArray(gameState.scores)) {
      return Response.json({ error: "Invalid payload" }, { status: 400 });
    }

    const assessments = Array.isArray(body.assessments) ? body.assessments : [];
    const fallback = buildFallbackReport(gameState, assessments);
    fallbackFromPayload = fallback;

    const condensedHistory = gameState.conversationHistory
      .filter((m) => m?.content?.trim())
      .slice(-12)
      .map((m) => `${m.role === "user" ? "Joueur" : "Agent"}: ${m.content}`)
      .join("\n");

    const docExcerpt = String(body.documentContext || "").slice(0, 3500);

    const message = await mistralChat({
      model: "mistral-large-latest",
      messages: [
        {
          role: "system",
          content:
            "Tu génères un rapport B2B de compétences pour un manager. Ton output doit être du JSON strict uniquement, sans markdown.",
        },
        {
          role: "user",
          content: `Contexte:\n- Document: ${String(body.documentFilename || "Document interne")}\n- Scenario: ${gameState.scenario.title}\n- Acte atteint: ${gameState.currentAct}/${gameState.scenario.acts.length}\n- Score global actuel: ${gameState.totalScore}/100\n\nScores par skill:\n${JSON.stringify(gameState.scores)}\n\nEvenements:\n${gameState.triggeredEvents.slice(-8).join("\n") || "Aucun"}\n\nHistorique recent:\n${condensedHistory || "Vide"}\n\nExtrait document:\n${docExcerpt || "Non fourni"}\n\nRetourne un JSON avec ces champs:\n{\n  "executiveSummary": string,\n  "globalWeightedScore": number,\n  "topCriticalGaps": [{\n    "skillId": string,\n    "skillName": string,\n    "criticality": "low"|"medium"|"high",\n    "masteryScore": number,\n    "confidence": number,\n    "failurePatterns": string[],\n    "evidenceExcerpts": string[],\n    "managerNote": string\n  }],\n  "recommendations": [{\n    "skillId": string,\n    "skillName": string,\n    "priority": "low"|"medium"|"high",\n    "recommendation": string\n  }],\n  "actionablePlan7Days": string[],\n  "decisionTrace": [{\n    "step": number,\n    "situation": string,\n    "playerDecision": string,\n    "impact": string,\n    "skillsInvolved": string[]\n  }]\n}\n\nContraintes:\n- Plan 7 jours: max 7 items, actionnables, verifiables.\n- Decision trace: 3 a 6 etapes max, uniquement des faits plausibles issus de l'historique.\n- Recommandations concises, orientées remédiation entreprise.`,
        },
      ],
      responseFormat: { type: "json_object" },
      temperature: 0.2,
      maxTokens: 1800,
      timeoutMs: 20000,
    });

    const raw = String(message.content || "").trim();
    const parsed = raw ? JSON.parse(raw) : null;
    const report = sanitizeReport(parsed, fallback);

    return Response.json({ report });
  } catch {
    if (fallbackFromPayload) {
      return Response.json({ report: fallbackFromPayload, fallback: true });
    }
    return Response.json({ error: "report_generation_failed" }, { status: 500 });
  }
}
