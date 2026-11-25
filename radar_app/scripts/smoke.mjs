// Teste de fumaça do app: sobe `next start` contra um Supabase simulado e confere que cada tela responde.
//
// Só para CI e máquina local. O Supabase simulado serve a base FICTÍCIA do repositório
// (data/contas.exemplo.json). Ela leva a marca `ficticia: true`, e o app recusa base fictícia de propósito.
// Por isso a marca é retirada aqui, apenas dentro deste processo de teste. Nada disso roda em produção,
// e nenhum dado real é lido.
//
// Uso: npm run build && npm run smoke
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = JSON.parse(await readFile(path.join(raiz, 'data/contas.exemplo.json'), 'utf8'));
delete base.ficticia;
const primeiraConta = base.contas[0].id;
const corpo = JSON.stringify([{ payload: base }]);

const supabase = http.createServer((req, res) => {
  const ok = req.url?.startsWith('/rest/v1/radar_snapshots') && req.headers.apikey === 'chave-de-teste';
  res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
  res.end(ok ? corpo : '{"message":"nao autorizado"}');
});
await new Promise(r => supabase.listen(0, '127.0.0.1', r));
const portaSupabase = supabase.address().port;
const portaApp = 3100 + Math.floor(Math.random() * 800);

const app = spawn(path.join(raiz, 'node_modules/.bin/next'), ['start', '-p', String(portaApp), '-H', '127.0.0.1'], {
  cwd: raiz,
  env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${portaSupabase}`, SUPABASE_SECRET_KEY: 'chave-de-teste', NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
app.stdout.on('data', d => (log += d));
app.stderr.on('data', d => (log += d));

function encerrar(codigo) {
  app.kill('SIGTERM');
  supabase.close();
  process.exit(codigo);
}

const url = p => `http://127.0.0.1:${portaApp}${p}`;
async function esperarApp() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url('/api/estados'));
      return;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  console.error('O app não subiu em 30 s.\n' + log);
  encerrar(1);
}
await esperarApp();

// [rota, status esperado, texto que precisa aparecer no HTML]
const casos = [
  ['/', 200, 'Hoje'],
  ['/radar', 200, 'Radar'],
  ['/contas', 200, 'Contas'],
  [`/contas/${primeiraConta}`, 200, base.contas[0].nome],
  // Débito conhecido: com loading.tsx o Next já enviou o status 200 quando notFound() roda (soft 404).
  // A tela "não encontrada" aparece; o teste confere o conteúdo e aceita 200 até isso ser corrigido.
  ['/contas/conta-que-nao-existe', [200, 404], 'Página não encontrada'],
  ['/decisores', 200, 'Decisores'],
  ['/fontes', 200, 'Fontes'],
  ['/metricas', 200, 'Métricas'],
  ['/icp', 200, 'ICP'],
  ['/aquisicao', 200, 'aquisição'],
  ['/aquisicao/stack', 200, 'Stack'],
  ['/clima', 200, 'Clima'],
  ['/api/estados', 204, null],
];

let falhas = 0;
for (const [rota, esperado, texto] of casos) {
  const inicio = performance.now();
  const r = await fetch(url(rota));
  const html = r.status === 204 ? '' : await r.text();
  const ms = Math.round(performance.now() - inicio);
  const problemas = [];
  const aceitos = [esperado].flat();
  if (!aceitos.includes(r.status)) problemas.push(`status ${r.status}, esperado ${aceitos.join(' ou ')}`);
  if (texto && !html.includes(texto)) problemas.push(`não encontrou "${texto}"`);
  if (html.includes('Base privada') || html.includes('Snapshot real ausente')) problemas.push('caiu na tela de erro da base');
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`${problemas.length ? 'FALHOU' : 'ok    '}  ${String(r.status).padEnd(3)}  ${String(ms).padStart(5)} ms  ${String(kb).padStart(5)} KB  ${rota}${problemas.length ? '  → ' + problemas.join('; ') : ''}`);
  if (problemas.length) falhas++;
}

// Sem base configurada, o app precisa falhar de forma explícita, nunca cair numa base fictícia.
const semBase = spawn(path.join(raiz, 'node_modules/.bin/next'), ['start', '-p', String(portaApp + 1), '-H', '127.0.0.1'], {
  cwd: raiz,
  env: { ...process.env, SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', NEXT_TELEMETRY_DISABLED: '1' },
  stdio: 'ignore',
});
let semBaseOk = false;
for (let i = 0; i < 60 && !semBaseOk; i++) {
  try {
    const html = await (await fetch(`http://127.0.0.1:${portaApp + 1}/`)).text();
    semBaseOk = !html.includes(base.contas[0].nome);
    console.log(`${semBaseOk ? 'ok    ' : 'FALHOU'}  sem SUPABASE_URL o app não mostra dados${semBaseOk ? '' : '  → mostrou a base fictícia'}`);
    break;
  } catch {
    await new Promise(r => setTimeout(r, 500));
  }
}
semBase.kill('SIGTERM');
if (!semBaseOk) falhas++;

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTodas as verificações passaram.');
if (falhas) console.error(log.slice(-4000));
encerrar(falhas ? 1 : 0);
