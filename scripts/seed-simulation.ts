// Seeds a demo trainer + learner and publishes the demo scenario (idempotent).
//   node --env-file=.env.local --import tsx scripts/seed-simulation.ts
// Requires the migrations in supabase/migrations to be applied (supabase db push).
import {createClient} from '@supabase/supabase-js';
import {validateConfig} from '../app/lib/simulation/contracts';
import demo from '../data/simulation/incident-it.v1.json';

const accounts=[
 {email:process.env.SEED_MANAGER_EMAIL||'formateur@yougotit.demo',password:process.env.SEED_PASSWORD||'Demo-2026-epita',full_name:'Formateur EPITA',role:'manager'},
 {email:process.env.SEED_LEARNER_EMAIL||'apprenant@yougotit.demo',password:process.env.SEED_PASSWORD||'Demo-2026-epita',full_name:'Philippe Durand',role:'student'},
];

async function main(){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const {data:list,error:le}=await db.auth.admin.listUsers({perPage:1000});if(le)throw le;
 const ids:Record<string,string>={};
 for(const a of accounts){
  let user=list.users.find(u=>u.email===a.email);
  if(!user){const {data,error}=await db.auth.admin.createUser({email:a.email,password:a.password,email_confirm:true,user_metadata:{full_name:a.full_name},app_metadata:{role:a.role}});if(error)throw error;user=data.user;console.log(`compte créé: ${a.email}`);}
  const {error}=await db.from('profiles').upsert({id:user.id,role:a.role,full_name:a.full_name});if(error)throw error;
  ids[a.role]=user.id;
 }
 const config=validateConfig(demo);
 const {data:existing,error:ee}=await db.from('simulation_scenarios').select('id').eq('owner_id',ids.manager).limit(1);if(ee)throw ee;
 let scenarioId=existing?.[0]?.id as string|undefined;
 if(scenarioId){const {error}=await db.from('simulation_scenarios').update({draft_config:config}).eq('id',scenarioId);if(error)throw error;}
 else{const {data,error}=await db.from('simulation_scenarios').insert({owner_id:ids.manager,draft_config:config}).select('id').single();if(error)throw error;scenarioId=data.id;}
 // Publishing creates a new immutable version (and a new progression series): only when content changed.
 const {data:sc}=await db.from('simulation_scenarios').select('published_version_id').eq('id',scenarioId).single();
 const {data:published}=sc?.published_version_id?await db.from('simulation_versions').select('config').eq('id',sc.published_version_id).single():{data:null};
 if(published&&JSON.stringify(published.config)===JSON.stringify(config))console.log(`scénario déjà publié à jour: ${config.title}`);
 else{const {data:version,error:pe}=await db.rpc('simulation_publish',{scenario:scenarioId,manager:ids.manager});if(pe)throw pe;console.log(`scénario publié: ${config.title} (version ${version})`);}
 console.log(`\nConnexion apprenant: ${accounts[1].email} / ${accounts[1].password}\nConnexion formateur: ${accounts[0].email} / ${accounts[0].password}`);
}
main().catch(e=>{console.error(e.message||e);process.exitCode=1;});
