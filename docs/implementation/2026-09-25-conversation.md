# YouGotIt — tranche verticale « simulateur de conversation »

Plan d'audit approuvé le 25 septembre 2026. Un scénario (incident IT), conversation libre à la voix avec un persona, avatar 3D, juge final sur rubrique, rapport et progression longitudinale. Tout le contenu pédagogique (persona, faits cachés, modules, rubrique, prompt du juge, référence) est de la donnée éditable dans le Studio, jamais du code.

## Mise en route

```sh
npm install                 # copie aussi TalkingHead + three.js dans public/vendor (postinstall)
supabase link --project-ref <ref> && supabase db push   # migrations supabase/migrations
npm run seed                # comptes démo + scénario publié (republie seulement si le contenu change)
npm run dev                 # /simulation (apprenant), /studio (formateur)
```

## Architecture

```
Micro ─PCM→ STT Gradium ─texte→ /turn (persona Mistral, SSE) ─texte→ TTS Gradium ─PCM 24 kHz→ haut-parleurs + HeadAudio → TalkingHead
                                                      │
                                   transcription persistée (Supabase, service role)
                                                      │
                                  /evaluate → juge gpt-4.1 sur rubrique versionnée → rapport validé → progression
```

- **Persona** : `app/lib/simulation/persona.ts` assemble les données du scénario et le template éditable `prompts.persona`. Les templates par défaut sont dans `data/simulation/prompt-templates.v1.json`, puis figés avec chaque version publiée. Modèle `provider:model` épinglé par session (`app/lib/simulation/models.ts`). Mesures du 25/09 : OpenAI chat ≈ 3,5 s avant le premier token sur ce compte (file d'attente côté OpenAI, indépendante du modèle) ; Mistral Nemo ≈ 300 ms. ministral-8b est aussi rapide mais invente des faits ; Nemo reste fidèle.
- **Voix** : `app/lib/conversation/audio.ts`. Gradium en production (`GRADIUM_API_KEY` requise). Le secours de développement exige explicitement `SIMULATION_ENABLE_VOICE_FALLBACK=true` : Deepgram (STT, fin de tour ~0,6–1,5 s selon la ponctuation) + OpenAI `gpt-4o-mini-tts` en PCM streamé (~500 ms). Les deux chemins sortent le même PCM, donc le lip-sync HeadAudio ne dépend pas du fournisseur. Interruption du persona dès deux mots de l'apprenant.
- **Avatar** : MPFB CC0 (`public/avatar`), 52 ARKit + 15 visèmes Oculus, dont un `viseme_sil` neutre ajouté localement. Rig Mixamo et noms des morphs vérifiés par `npm run check:avatar`. Textures optimisées : 20,46 Mo contre environ 35 Mo initialement. Tenue remplacée à l'exécution par un tissu uni sombre (`dressForWork`). TalkingHead et three sont chargés en ESM natif via un import map (le bundler ne sait pas résoudre leurs imports dynamiques).
- **Juge** : `app/lib/simulation/judge.ts`, prompt éditable et versionné (`prompts.judge`, version et modèle stockés avec chaque évaluation). Sorties validées côté serveur : chaque citation doit exister mot pour mot dans un tour de l'apprenant, sinon une seule relance corrective, jamais de score inventé. En plus des compétences : carte de découverte des faits cachés (par thème, sans révéler le fait), nature de chaque question (ouverte / fermée / orientée / solution), meilleur moment.

## Harnais d'évaluation

```sh
npm test                                   # 25 tests : contrats, citations, délais du juge, audio
npm run test:e2e                            # Chromium : APIs simulées, véritable rendu avatar
npm run check:avatar                        # rig + 52 ARKit + 15 visèmes
npm run eval:judge -- --repeat=3 --output=run.json [--compare=previous.json]
npm run simulate -- --style=good|average|pushy --turns=8   # entretien complet simulé + rapport
```

Le juge n'est pas parfaitement déterministe : sur le même prompt, deux runs diffèrent de ±2 fixtures (~12 scores sur 168). Toute modification de rubrique ou de prompt se juge donc avec `--repeat=3` (score médian + taux de stabilité), jamais sur un seul run. Exemple concret : une tentative (« une intervention peut prouver plusieurs compétences ») a fait monter à 2 le score « parties prenantes » d'un transcript qui les oublie ; elle a été annulée.

Écarts connus à arbitrer avec EPITA : sur les transcripts d'une seule question, le juge est plus sévère que les attendus provisoires (`need_context` 0–1 au lieu de 2–3). Ces attendus sont des hypothèses rédigées avant calibration, pas une vérité terrain.

## État

- [x] Migrations (base `profiles` idempotente + simulation), RLS, versions immuables, sessions, tours, évaluations avec version du prompt.
- [x] Contenu démo JSON, 4 modules, 7 compétences ; les données privées ne sortent jamais du serveur.
- [x] Persona streamé, juge avec citations validées, corpus de 24 fixtures, harnais avec répétitions et dérive, simulateur d'entretien.
- [x] Voix bout en bout (fallback vérifié en réel : TTS → STT français) ; Gradium branché mais non testé faute de clé.
- [x] Avatar, lip-sync, réactions (écoute, réflexion, gestes).
- [x] Parcours apprenant, rapport (carte du besoin, frise des questions, niveaux), progression, Studio.
- [x] Build de production, TypeScript et 25 tests réussis. ESLint ciblé sur le nouveau simulateur réussi ; le lint global conserve des erreurs dans le code historique. Trois parcours vérifiés dans Chromium avec APIs simulées au niveau réseau : apprenant avec avatar réel, mobile, et Studio (brouillon évalué, résultat invalidé après modification, historique formateur).
- [ ] **Bloquant** : le projet Supabase distant ne résout plus (pause probable). Le réactiver, puis `supabase db push` et `npm run seed`. Les migrations, politiques RLS, droits de lecture et d’écriture, paires de tours atomiques, leases exclusifs et évaluations immuables ont été exécutés sur PostgreSQL 16 local via `tests/database.integration.sql`. Auth Supabase est émulée dans ce test ; la base hébergée reste à vérifier.
- [ ] Tester Gradium avec une vraie clé (latence, qualité des voix françaises).
- [ ] Valider les performances et le lip-sync vocal sur les machines des participants. Le MPFB CC0 livré satisfait le choix de licence ; RocketBox est une alternative éventuelle, pas une dépendance.
- [ ] Calibration EPITA après le 20 octobre : remplacer les attendus provisoires.


## Revue du 26 septembre

- Studio : test du brouillon sur un transcript de référence, écarts détaillés, invalidation du résultat dès modification, consultation des rapports par apprenant sur les scénarios du formateur. Le harnais CLI refuse de comparer une rubrique différente au corpus de démonstration : fournir des annotations adaptées avec `--corpus=annotations.json` (même structure que le corpus livré).
- Progression : comparaison seulement à version de scénario, prompt et modèle identiques ; les baisses sont affichées. Historique limité aux 200 sessions les plus récentes, signalé au formateur. Une pagination sera nécessaire pour le déploiement à 138 participants.
- Audio : libération du micro après échec, y compris si l’autorisation arrive tard ; attente de la confirmation de finalisation STT avant envoi ; gestion des rejets des requêtes TTS préchargées. Aucun remplacement silencieux de Gradium en production.
- Avatar : éclairage adouci, carte d’introduction déplacée pour laisser le visage visible, résolution plafonnée. Les fichiers avatar/audio/vendor ne déclenchent plus un rafraîchissement d’authentification par ressource.
- Accessibilité : fermeture des dialogues avec Échap, confinement du focus, restitution du focus à la fermeture.
- Vérification réelle du juge : `complete-discovery`, trois répétitions le 26 septembre, 7/7 scores médians exactement conformes aux attendus, stabilité 100 %. C’est un test de fonctionnement ciblé, pas une validation des 24 fixtures ni une calibration pédagogique.

### Limites explicites

La chaîne vocale Gradium, la persistance sur Supabase distant et la latence de bout en bout ne sont pas encore validées ensemble. La latence nulle n’est pas promise. Les transcripts conservent la réponse générée entière, même si l’apprenant interrompt sa lecture audio : le suivi précis des segments effectivement entendus reste à ajouter avant d’utiliser les interruptions comme indicateur pédagogique. Les anciennes routes de quiz restent présentes pour migration, mais le nouveau parcours ne les utilise pas. Les changements sont locaux, non commités ; ils ne sont pas encore intégrés à `main` ni déployés.
