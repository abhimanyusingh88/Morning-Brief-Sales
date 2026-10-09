import { getDb } from '../src/lib/db';
import { refresh } from '../src/lib/live/jobs';
import { publishReports } from '../src/lib/live/reports';
async function main(){const db=await getDb();try{console.log(process.argv.includes('--publish-only')?{published:await publishReports(db)}:await refresh(db,{budgetMs:180000,discovery:!process.argv.includes('--feeds-only'),kinds:process.argv.includes('--market-only')?['market']:(process.argv.includes('--news-only')||process.argv.includes('--feeds-only'))?['news']:undefined}));console.log('Report versions published from verified evidence only.');}finally{await db.close();}}
main().catch(()=>{console.error('Refresh failed. Check database and source connectivity. Secrets are not logged.');process.exitCode=1;});
