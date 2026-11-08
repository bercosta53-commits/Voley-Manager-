import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';

function loadTS(path,cache=new Map()){
 if(cache.has(path))return cache.get(path);
 const source=fs.readFileSync(path,'utf-8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};cache.set(path,m.exports);
 const base=path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):'';
 new Function('require','module','exports',compiled)((name)=>name.startsWith('./')?
   loadTS(base+name.slice(2)+'.ts',cache):createRequire(import.meta.url)(name),m,m.exports);
 cache.set(path,m.exports);return m.exports;
}
const {analisarConta,analisarBase,contagemNiveis}=loadTS('lib/aquisicao-maturidade.ts');
const records=JSON.parse(fs.readFileSync('data/aquisicao.json','utf-8')).accounts;
assert.equal(records.length,200);
const results=analisarBase(records);
const levels=contagemNiveis(results);
assert.deepEqual(Object.values(levels),[43,40,61,56,0,0],'v2 classification drift');
const candidates=results.filter(x=>x.potencialL4);
assert.equal(candidates.length,20,'potential L4 drift');
assert.equal(candidates.filter(x=>x.potencialL4ComEvento).length,1);
assert.equal(results.filter(x=>x.maturidadeConfirmada).length,0);
assert.equal(results.filter(x=>x.foco).length,117);
assert.ok(results.some(x=>x.nivel===3&&x.dimensoes.orquestracao===0),'L3 must not require visible CRM script');
for(const a of results){
 assert.ok(a.nivel===0||a.nivel>=1&&a.nivel<=5);
 assert.ok(a.qualidadeEvidencia>=0&&a.qualidadeEvidencia<=100);
 assert.ok(a.atratividadeVelora>=0&&a.atratividadeVelora<=100);
 if(a.potencialL4)assert.equal(a.nivel,3);
}
const seed=structuredClone(records.find(x=>x.id==='VEL-0029'));
assert.ok(seed,'seed account missing');
const operational={
 crmPipelineRevenue:true,sourceAttribution:true,governance:true,
 experimentation:false,incrementality:false,forecasting:false,
 verifiedAt:'2026-11-08',reviewer:'unit-calibration',sourceUrl:'https://example.org/audit'
};
assert.equal(analisarConta({...seed,evidenciaOperacional:operational}).nivel,4,'L4 should be attainable');
assert.equal(analisarConta({...seed,evidenciaOperacional:{...operational,experimentation:true,incrementality:true,forecasting:true}}).nivel,5,'L5 should be attainable');
assert.ok(analisarConta({...seed,evidenciaOperacional:{...operational,sourceUrl:''}}).nivel<4,'L4 must require a source');
const superficial={...seed,tags:Object.fromEntries(Object.keys(seed.tags).map(k=>[k,'not_observed'])),forms:0,whatsappLinks:0,
 historicalTech:['Google Tag Manager','HubSpot','Facebook Pixel'],evidenciaOperacional:undefined};
assert.equal(analisarConta(superficial).nivel,0,'historical-only technologies must not raise maturity');
console.log(JSON.stringify({result:'PASS',total:200,levels,potentialL4:candidates.length,potentialL4WithEvent:1,focus:117,l4Validation:'PASS',l5Validation:'PASS'},null,2));
