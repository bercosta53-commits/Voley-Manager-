import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('data/aquisicao.json','utf8'));
if(data.accounts.length!==120)throw new Error('Expected 120 accounts');
const ids=new Set(data.accounts.map(x=>x.id));if(ids.size!==120)throw new Error('Duplicate ids');
const required=['gtm','ga4','googleAds','meta','linkedin','rdStation','hubspot'];
for(const a of data.accounts){
 if(!a.id.startsWith('VEL-')||!a.domain)throw new Error('Invalid ID/domain');
 if(!Number.isFinite(a.validPages)||a.validPages<0)throw new Error('Invalid page count');
 if(required.some(k=>!['network','request','html','not_observed','not_tested'].includes(a.tags[k])))throw new Error('Invalid evidence status in '+a.id);
}
console.log('Maturity data integrity passed:',data.accounts.length,'accounts,',data.accounts.filter(x=>x.validPages>0).length,'sites audited.');
