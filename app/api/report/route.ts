import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { chatCompletion } from "@/app/lib/agents/openai-client";
import { ManagerAssessment, MultiAgentGameState, SimulationReport, FailurePattern, EmployeeVibe } from "@/app/lib/types";

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

  // Fallback failure pattern analysis from score data
  const failurePatternAnalysis: FailurePattern[] = sortedGaps
    .filter((s) => s.masteryScore < 60)
    .slice(0, 3)
    .map((s) => ({
      pattern: `Difficulte recurrente sur "${s.name}"`,
      frequency: Math.max(1, s.failurePatterns.length),
      affectedSkills: [s.name],
      recommendation: `Renforcement cible sur ${s.name} via micro-sessions pratiques.`,
    }));

  // Fallback employee vibe from conversation analysis
  const playerMessages = gameState.conversationHistory.filter((m) => m.role === "user");
  const avgLength = playerMessages.length > 0
    ? playerMessages.reduce((acc, m) => acc + m.content.length, 0) / playerMessages.length
    : 0;
  const employeeVibe: EmployeeVibe = {
    tone: avgLength > 80 ? "Detaille et methodique" : avgLength > 30 ? "Concis et direct" : "Hesitant et bref",
    stressResilience: totalScore >= 70 ? "Bonne resistance" : totalScore >= 45 ? "Resistance moyenne" : "Fragile sous pression",
    overallAssessment: totalScore >= 70
      ? "Collaborateur engage, repond avec assurance."
      : totalScore >= 45
        ? "Collaborateur volontaire mais manque de confiance sur certains sujets."
        : "Collaborateur en difficulte, necessite un accompagnement rapproche.",
    details: [
      `${playerMessages.length} interactions enregistrees.`,
      `Longueur moyenne des reponses: ${Math.round(avgLength)} caracteres.`,
      totalScore >= 60 ? "A su maintenir son calme face aux agents." : "Signes d'hesitation detectes face a la pression des agents.",
    ],
  };

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
      "Briefing manager 20 min sur les 3 lacunes prioritaires.",
      "Micro-sessions ciblées sur les procédures non maîtrisées.",
      "Nouvelle simulation de validation en fin de semaine.",
    ],
    decisionTrace,
    failurePatternAnalysis,
    employeeVibe,
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
    ? data.actionablePlan7Days.map(String).slice(0, 3)
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

  // Parse failure pattern analysis
  const failurePatternAnalysis: FailurePattern[] = Array.isArray(data.failurePatternAnalysis)
    ? data.failurePatternAnalysis
        .map((p) => {
          const x = p as Record<string, unknown>;
          return {
            pattern: String(x.pattern || ""),
            frequency: clamp(Number(x.frequency || 1), 1, 10),
            affectedSkills: Array.isArray(x.affectedSkills) ? x.affectedSkills.map(String).slice(0, 4) : [],
            recommendation: String(x.recommendation || ""),
          };
        })
        .filter((p) => p.pattern)
        .slice(0, 2)
    : fallback.failurePatternAnalysis || [];

  // Parse employee vibe
  const rawVibe = data.employeeVibe as Record<string, unknown> | undefined;
  const employeeVibe: EmployeeVibe = rawVibe && typeof rawVibe === "object"
    ? {
        tone: String(rawVibe.tone || fallback.employeeVibe?.tone || "Non evalue"),
        stressResilience: String(rawVibe.stressResilience || fallback.employeeVibe?.stressResilience || "Non evalue"),
        overallAssessment: String(rawVibe.overallAssessment || fallback.employeeVibe?.overallAssessment || "Non evalue"),
        details: Array.isArray(rawVibe.details) ? rawVibe.details.map(String).slice(0, 2) : fallback.employeeVibe?.details || [],
      }
    : fallback.employeeVibe || { tone: "Non evalue", stressResilience: "Non evalue", overallAssessment: "Non evalue", details: [] };

  return {
    ...fallback,
    globalWeightedScore: clamp(Number(data.globalWeightedScore || fallback.globalWeightedScore), 0, 100),
    executiveSummary: String(data.executiveSummary || fallback.executiveSummary || ""),
    topCriticalGaps: topCriticalGaps.length > 0 ? topCriticalGaps : fallback.topCriticalGaps,
    recommendations: recommendations.length > 0 ? recommendations : fallback.recommendations,
    actionablePlan7Days,
    decisionTrace,
    failurePatternAnalysis,
    employeeVibe,
    generatedAt: new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let fallbackFromPayload: SimulationReport | null = null;
  try {
    let body: ReportRequest & { enrollmentId?: string };
    try {
      body = (await req.json()) as ReportRequest & { enrollmentId?: string };
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    let gameState = body?.gameState;

    // SEC-05: Prefer server-side game state for enrolled students
    if (body.enrollmentId) {
      const { data: enrollment } = await supabase
        .from("enrollments")
        .select("game_state, student_id")
        .eq("id", body.enrollmentId)
        .single();

      if (enrollment?.game_state && enrollment.student_id === user.id) {
        gameState = enrollment.game_state as MultiAgentGameState;
      }
    }

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

    const message = await chatCompletion({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "Tu génères un rapport B2B de compétences pour un manager. Ton output doit être du JSON strict uniquement, sans markdown.",
        },
        {
          role: "user",
          content: `Contexte:
- Document: ${String(body.documentFilename || "Document interne")}
- Scenario: ${gameState.scenario.title}
- Acte atteint: ${gameState.currentAct}/${gameState.scenario.acts.length}
- Score global actuel: ${gameState.totalScore}/100
- Questions echouees: ${gameState.interactionState?.failedQAs?.join(", ") || "Aucune"}

Scores par skill:
${JSON.stringify(gameState.scores)}

Evenements:
${gameState.triggeredEvents.slice(-8).join("\n") || "Aucun"}

Historique recent (les reponses du joueur sont cles pour l'analyse):
${condensedHistory || "Vide"}

Extrait document:
${docExcerpt || "Non fourni"}

Retourne un JSON CONCIS avec ces champs:
{
  "executiveSummary": "1-2 phrases courtes, directes, actionnables.",
  "globalWeightedScore": number,
  "topCriticalGaps": [{
    "skillId": string,
    "skillName": string,
    "criticality": "low"|"medium"|"high",
    "masteryScore": number,
    "confidence": number,
    "failurePatterns": ["pattern en 5 mots max"],
    "evidenceExcerpts": ["1 citation courte"],
    "managerNote": "10 mots max."
  }],
  "recommendations": [{
    "skillId": string,
    "skillName": string,
    "priority": "low"|"medium"|"high",
    "recommendation": "Action en 10 mots max"
  }],
  "actionablePlan7Days": ["Action 1 en 10 mots", "Action 2 en 10 mots", "Action 3 en 10 mots"],
  "failurePatternAnalysis": [{
    "pattern": "Pattern recurrent en 1 phrase courte",
    "frequency": number,
    "affectedSkills": ["skill1"],
    "recommendation": "Remediation en 1 phrase."
  }],
  "employeeVibe": {
    "tone": "3-4 mots (ex: Professionnel et pose)",
    "stressResilience": "1 phrase courte",
    "overallAssessment": "1-2 phrases max",
    "details": ["Observation 1", "Observation 2"]
  }
}

Contraintes STRICTES:
- topCriticalGaps: 2-3 items max. managerNote = 10 mots max.
- actionablePlan7Days: exactement 3 items, 10 mots max chacun.
- failurePatternAnalysis: 1-2 patterns max.
- employeeVibe.details: exactement 2 items.
- Tout le JSON doit etre COURT et PERCUTANT. Pas de phrases longues.`,
        },
      ],
      responseFormat: { type: "json_object" },
      temperature: 0.2,
      maxTokens: 1200,
      timeoutMs: 20000,
    });

    const raw = String(message.content || "").trim();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      console.warn("[report] Failed to parse OpenAI JSON response, using fallback.");
    }
    const report = sanitizeReport(parsed, fallback);

    return Response.json({ report });
  } catch {
    if (fallbackFromPayload) {
      return Response.json({ report: fallbackFromPayload, fallback: true });
    }
    return Response.json({ error: "report_generation_failed" }, { status: 500 });
  }
}
