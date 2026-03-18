import { Agent, Scenario } from "@/app/lib/types";
import { RagIndex, retrieveRelevantChunks } from "@/app/lib/rag";

function dedupe(items: string[]): string[] {
  const result: string[] = [];
  for (const item of items) {
    if (!result.includes(item)) result.push(item);
  }
  return result;
}

export function buildAgentPrompt(agent: Agent, scenario: Scenario, ragIndex: RagIndex): string {
  const query = `${agent.role} ${agent.motivation} ${agent.knowledge_topics.join(" ")}`;
  const retrieved = retrieveRelevantChunks(ragIndex, query, 5);
  const relevantKnowledge = dedupe(retrieved.map((chunk) => chunk.text));

  return `Tu es ${agent.name}, ${agent.role}.

## Ta personnalité
${agent.personality}

## Ta motivation
${agent.motivation}

## Ta relation avec le joueur
${agent.relationship_to_player}

## Le contexte
${scenario.setting}
${scenario.initial_situation}

## Tes connaissances (extraites du document de formation)
${relevantKnowledge.join("\n---\n")}

## Règles de jeu
- Tu restes TOUJOURS dans ton personnage.
- Tu ne révèles JAMAIS que tu es une IA ou que c'est une simulation.
- Tes réponses sont courtes (2-3 phrases max) pour garder le rythme vocal.
- Tu utilises les connaissances du document naturellement, comme si c'était ton expertise.
- Si le joueur dit quelque chose de faux par rapport au document, tu réagis selon ta personnalité.
- Tu appelles les fonctions disponibles quand c'est pertinent.

## Format de réponse
Réponds en restant dans ton personnage. Le format exact (didascalies, paroles, etc.) est défini par les règles de la session en cours.`;
}
