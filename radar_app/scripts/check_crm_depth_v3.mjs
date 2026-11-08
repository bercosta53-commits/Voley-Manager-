import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

function loadTS(path,cache=new Map()){
 if(cache.has(path))return cache.get(path);
 const source=fs.readFileSync(path,'utf-8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};cache.set(path,m.exports);
 const base=path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):'';
 new Function('require','module','exports',js)((name)=>name.startsWith('./')?loadTS(base+name.slice(2)+'.ts',cache):require(name),m,m.exports);
 cache.set(path,m.exports);return m.exports;
}
const {avaliarCrm}=loadTS('lib/crm-profundidade.ts');
const {analisarConta,analisarBase,contagemNiveis}=loadTS('lib/aquisicao-maturidade.ts');
const records=JSON.parse(fs.readFileSync('data/aquisicao.json','utf-8')).accounts;
assert.equal(records.length,200);
const analyzed=analisarBase(records),levels=contagemNiveis(analyzed);
assert.deepEqual(Object.values(levels),[43,40,61,56,0,0]);
const sources={};
for(const a of analyzed){sources[a.crm.origem]=(sources[a.crm.origem]||0)+1;}
assert.equal(sources.operacional_validado||0,0);
assert.equal(analyzed.filter(a=>a.crm.fornecedor==='HubSpot'&&a.crm.origem==='script_web').length,10);
assert.equal(analyzed.filter(a=>a.conta.tags.salesforce==='network').length,0);
assert.equal(analyzed.filter(a=>a.crm.fornecedor==='RD Station'&&a.crm.origem==='script_web').length,44-1); // GX2 shares HubSpot, rank selects stronger
const base=structuredClone(records.find(x=>x.id==='VEL-0029'));
assert.ok(base);
const tags=Object.fromEntries(Object.entries(base.tags).map(([k,v])=>[k,['salesforce','hubspot','rdStation','pipedrive','ploomes','mautic','bitrix','activeCampaign'].includes(k)?'not_observed':v]));
const withWeb=(key)=>({...base,tags:{...tags,[key]:'network'},crmOperacional:undefined});
const hub=analisarConta(withWeb('hubspot')),rd=analisarConta(withWeb('rdStation')),sfWeb=analisarConta(withWeb('salesforce'));
assert.equal(hub.crm.confirmado,false);
assert.equal(hub.crm.fornecedor,'HubSpot');
assert.equal(hub.crm.score,46);assert.equal(rd.crm.score,18);assert.equal(sfWeb.crm.score,52);
assert.ok(hub.dimensoes.orquestracao>=rd.dimensoes.orquestracao+25);
assert.ok(hub.atratividadeVelora>=rd.atratividadeVelora+6,'HubSpot web should matter in prioritization');
const proof={fornecedor:'HubSpot',edicao:'Sales Hub Enterprise',ativo:true,pipelineComercial:true,reviewer:'unit-test',verifiedAt:'2026-11-08',sourceUrl:'https://example.com/audit'};
const hubVerified=analisarConta({...withWeb('hubspot'),crmOperacional:proof});
const rdVerified=analisarConta({...withWeb('rdStation'),crmOperacional:{...proof,fornecedor:'RD Station CRM',edicao:'RD Vendas'}});
const salesforceVerified=analisarConta({...withWeb('salesforce'),crmOperacional:{...proof,fornecedor:'Salesforce',edicao:'Sales Cloud Enterprise'}});
assert.equal(hubVerified.crm.score,94);
assert.equal(salesforceVerified.crm.score,98);
assert.equal(rdVerified.crm.score,47);
assert.equal(hubVerified.crm.confirmado,true);
assert.ok(hubVerified.atratividadeVelora>=rdVerified.atratividadeVelora+9,'Verified HubSpot must move score materially');
assert.equal(analisarConta({...withWeb('hubspot'),crmOperacional:{...proof,sourceUrl:'invalid'}}).crm.confirmado,false);
const hist={...withWeb('rdStation'),tags:{...tags},historicalTech:['Salesforce','HubSpot'],crmOperacional:undefined};
assert.equal(avaliarCrm(hist).score,0);
assert.equal(avaliarCrm(hist).origem,'historico');
// A meaningful CRM validation upgrades suitable acquisition L2 -> L3, never L4 by brand alone.
const l2=records.find(x=>{
 const a=analisarConta(x);
 return a.nivel===2&&x.validPages>0&&x.forms+x.whatsappLinks>0&&
  (x.tags.gtm==='network'||x.tags.ga4==='network');
});
assert.ok(l2,'Need L2 calibration case');
const upgraded=analisarConta({...l2,crmOperacional:{...proof,fornecedor:'Salesforce'}});
assert.equal(upgraded.nivel,3,'Verified enterprise CRM should advance suitable L2 to L3');
assert.ok(upgraded.nivel<4,'Verified brand alone cannot certify revenue integration');
console.log(JSON.stringify({status:'PASS',base:records.length,levels,crmEvidence:sources,hubspotWeb:hub.crm.score,rdWeb:rd.crm.score,hubspotVerified:hubVerified.crm.score,salesforceVerified:salesforceVerified.crm.score,rdVerified:rdVerified.crm.score,exampleUpgrade:l2.name},null,2));
