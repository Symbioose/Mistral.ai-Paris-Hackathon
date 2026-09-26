// Plays a full interview against the real persona prompt with a simulated learner, then runs the real judge.
// Use it to sanity-check a scenario after editing it (persona realism, fact disclosure, report quality).
//   node --env-file=.env.local --import tsx scripts/simulate-conversation.ts [--turns=8] [--style=good|average|pushy] [--module=1] [--output=file.json]
import fs from 'node:fs';
import OpenAI from 'openai';
import {judge} from '../app/lib/simulation/judge';
import {personaSystemPrompt} from '../app/lib/simulation/persona';
import {conversationClient,conversationModel} from '../app/lib/simulation/models';
import {validateConfig,type Turn} from '../app/lib/simulation/contracts';
import scenario from '../data/simulation/incident-it.v1.json';

const arg=(name:string,fallback:string)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const STYLES:Record<string,string>={
 good:'Tu es un consultant expérimenté en relation client: questions ouvertes et neutres, tu explores contexte, incidents, impacts, parties prenantes, critères de succès, tu reformules, tu ne proposes rien avant la fin.',
 average:'Tu es un ancien consultant technique de 45 ans en reconversion: tu poses quelques bonnes questions ouvertes mais tu reviens vite à la technique, tu poses des questions fermées, et vers le milieu tu proposes une piste technique.',
 pushy:'Tu es un consultant technique pressé: tu fais des hypothèses sur la cause dès le début, poses des questions fermées ou orientées et proposes rapidement une solution.',
};

async function main(){
 const config=validateConfig(scenario);const client=new OpenAI();
 const turnsCount=Number(arg('turns','8')),style=arg('style','average'),moduleNumber=Number(arg('module','1'));
 const reference=arg('persona',conversationModel());const persona=conversationClient(reference);
 const turns:Turn[]=[];const latencies:number[]=[];
 for(let i=0;i<turnsCount;i++){
  const learner=await client.chat.completions.create({model:'gpt-4.1',temperature:.8,max_tokens:120,messages:[
   {role:'system',content:`${STYLES[style]} Tu mènes un entretien oral avec ${config.personaName}, ${config.personaRole}. Contexte: ${config.brief} Réponds uniquement par ta prochaine réplique orale, en une ou deux phrases.${i===turnsCount-1?' C’est ta dernière réplique: fais une courte synthèse et propose une suite.':''}`},
   ...turns.map(t=>({role:(t.role==='user'?'assistant':'user') as 'assistant'|'user',content:t.content})),
   ...(turns.length?[]:[{role:'user' as const,content:'(L’entretien commence, tu prends la parole.)'}]),
  ]});
  const text=learner.choices[0].message.content!.trim();
  turns.push({id:`u${i+1}`,role:'user',content:text,created_at:new Date().toISOString()});
  const started=Date.now();let first=0;let reply='';
  const stream=await persona.client.chat.completions.create({model:persona.model,stream:true,max_tokens:160,temperature:.7,messages:[{role:'system',content:personaSystemPrompt(config,moduleNumber)},...turns.map(t=>({role:t.role,content:t.content}))]});
  for await(const chunk of stream){const d=chunk.choices[0]?.delta?.content;if(d){if(!first)first=Date.now()-started;reply+=d;}}
  latencies.push(first);
  turns.push({id:`a${i+1}`,role:'assistant',content:reply.trim(),created_at:new Date().toISOString()});
  console.log(`\nVOUS      ${text}\n${config.personaName.split(' ')[0].toUpperCase().padEnd(9)} ${reply.trim()}   [${first} ms]`);
 }
 const t0=Date.now();const {report,model,promptVersion}=await judge(config,turns,moduleNumber);
 console.log(`\n— Juge ${model} (${promptVersion}) en ${((Date.now()-t0)/1000).toFixed(1)} s`);
 console.log(report.summary);
 for(const s of report.skills)console.log(`  ${s.label.padEnd(34)} ${s.score??'—'}/4`);
 if(report.discovery)console.log(`  Découverte: ${report.discovery.filter(d=>d.discovered).length}/${report.discovery.length} · ${report.discovery.map(d=>(d.discovered?'●':'○')+' '+d.theme).join(' | ')}`);
 if(report.questions)console.log(`  Questions: ${report.questions.map(q=>q.kind).join(', ')}`);
 const sorted=[...latencies].sort((a,b)=>a-b);
 console.log(`  Persona ${reference}: premier token médian ${sorted[Math.floor(sorted.length/2)]} ms, max ${sorted.at(-1)} ms`);
 const output=arg('output','');if(output)fs.writeFileSync(output,JSON.stringify({style,moduleNumber,turns,report},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
