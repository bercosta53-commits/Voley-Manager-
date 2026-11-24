import { readFile } from 'node:fs/promises';
const file = process.argv[2];
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!file || !url || !key) throw Error('Informe caminho do snapshot e configure SUPABASE_URL/SUPABASE_SECRET_KEY no ambiente.');
const base = JSON.parse(await readFile(file, 'utf8'));
if (base.ficticia || !Array.isArray(base.contas) || !base.contas.length || !Array.isArray(base.sinais) || !Array.isArray(base.fontes)) throw Error('Snapshot inválido ou fictício.');
const ids = new Set(base.contas.map(c=>c.id));
if (ids.size !== base.contas.length || ids.has(undefined) || base.sinais.some(s=>!ids.has(s.contaId))) throw Error('IDs duplicados ou sinais sem conta.');
const endpoint = new URL('/rest/v1/radar_snapshots', url);
endpoint.searchParams.set('on_conflict','id');
const res = await fetch(endpoint, {
  method:'POST',
  headers:{apikey:key,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
  body:JSON.stringify({id:'current',payload:base,updated_at:new Date().toISOString()})
});
if (!res.ok) throw Error('Importação falhou: HTTP '+res.status);
endpoint.search = '?id=eq.current&select=payload';
const check = await fetch(endpoint,{headers:{apikey:key},cache:'no-store'});
if (!check.ok) throw Error('Falha na verificação: HTTP '+check.status);
const [row] = await check.json();
if (row?.payload?.contas?.length !== base.contas.length || row.payload.sinais.length !== base.sinais.length || row.payload.fontes.length !== base.fontes.length) throw Error('Contagens divergentes.');
console.log(JSON.stringify({contas:base.contas.length,sinais:base.sinais.length,fontes:base.fontes.length}));
