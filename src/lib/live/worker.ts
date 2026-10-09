import cron from 'node-cron';
import { getDb } from '../db';
import { refresh } from './jobs';
let started=false,running=false;
async function tick(){
 if(running)return;running=true;
 try{const db=await getDb();const r=await refresh(db,{budgetMs:170000});console.log('[worker] cycle complete',r.completed,'jobs,',r.failed,'failed');}
 catch{console.warn('[worker] cycle failed; the next run retries');}
 finally{running=false;}
}
/** Every five minutes from 05:00 to 09:55 ET (brief built and emailed before 10:00), then every thirty minutes. */
export function startWorker(){
 if(started)return;started=true;
 const tz={timezone:'America/New_York'};
 cron.schedule('*/5 5-9 * * 1-5',tick,tz);
 cron.schedule('*/30 10-20 * * 1-5',tick,tz);
 console.log('[worker] morning brief schedule active (America/New_York)');
}
