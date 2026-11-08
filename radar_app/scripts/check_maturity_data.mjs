import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('data/aquisicao.json','utf8'));
if(data.accounts.length!==200)throw new Error('Expected 200 accounts');
const ids=new Set(data.accounts.map(x=>x.id)),domains=new Set(data.accounts.map(x=>x.domain.toLowerCase().replace(/^www\./,'')));
if(ids.size!==200||domains.size!==200)throw new Error('Duplicate id or domain');
const required=['gtm','ga4','googleAds','meta','linkedin','rdStation','hubspot'];
const valid=['network','request','html','not_observed','not_tested'];
for(const a of data.accounts){
 if(!a.id.startsWith('VEL-')||!a.domain)throw new Error('Invalid ID/domain');
 if(!Number.isFinite(a.validPages)||a.validPages<0)throw new Error('Invalid page count');
 if(required.some(k=>!valid.includes(a.tags[k])))throw new Error('Invalid evidence status in '+a.id);
 if(a.validPages===0&&required.some(k=>a.tags[k]==='network'))throw new Error('Network confirmed without valid page: '+a.id);
}
const cohort=data.accounts.filter(x=>x.sourceCohort==='L12 • Expansão 80');
if(cohort.length!==80)throw new Error('Expected exactly 80 new L12 accounts');
if(cohort.some(x=>x.verifiedICP!==false||x.verifiedRevenue!==false))throw new Error('ICP/revenue flags wrong');
const examined=data.accounts.filter(x=>x.validPages>0);
if(examined.length!==173)throw new Error('Expected 173 audited domains, got '+examined.length);
console.log('PASS',data.accounts.length,'accounts;',cohort.length,'new;',examined.length,'audited;',cohort.filter(x=>x.validPages>0).length,'new sites audited.');
