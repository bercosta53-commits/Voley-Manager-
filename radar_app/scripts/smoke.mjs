// Teste de fumaça do app: sobe `next start` contra um Supabase simulado (scripts/app-de-teste.mjs, base
// fictícia, só CI e máquina local) e confere que cada tela responde.
//
// Uso: npm run build && npm run smoke
import path from 'node:path';
import { spawn } from 'node:child_process';
import { baseDeTeste, MARCA_FICTICIA, raiz, subirApp } from './app-de-teste.mjs';

const base = await baseDeTeste();
const primeiraConta = base.contas[0].id;
let app;
try {
  app = await subirApp(base);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const portaApp = app.porta;
const url = app.url;

function encerrar(codigo) {
  app.parar();
  process.exit(codigo);
}

// [rota, status esperado, texto que precisa aparecer no HTML]
const casos = [
  ['/', 200, 'Hoje'],
  ['/radar', 200, 'Prioridade de contas'],
  ['/radar/proximidade', 200, 'Panorama da base'],
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

function conferir(ok, descricao, detalhe = '') {
  console.log(`${ok ? 'ok    ' : 'FALHOU'}  ${descricao}${ok || !detalhe ? '' : '  → ' + detalhe}`);
  if (!ok) falhas++;
}

// Sinal marcado como exemplo nunca aparece como real, em nenhuma tela.
for (const rota of ['/', `/contas/${primeiraConta}`, '/contas']) {
  const html = await (await fetch(url(rota))).text();
  conferir(!html.includes(MARCA_FICTICIA), `sinal de exemplo fora de ${rota}`, 'o sinal fictício apareceu');
}

// /api/saude: contagens, descarte do sinal de exemplo e frescor (a base fictícia é de set/2026, então está velha).
{
  const r = await fetch(url('/api/saude'));
  const s = await r.json().catch(() => ({}));
  conferir(r.status === 200, '/api/saude responde 200 com a base legível', `status ${r.status}`);
  conferir(s.contagens?.contas === base.contas.length, '/api/saude conta as contas', JSON.stringify(s.contagens));
  conferir(s.qualidade?.descartados?.exemplo === 1, '/api/saude registra o sinal de exemplo descartado', JSON.stringify(s.qualidade));
  conferir(s.status === 'desatualizada' && s.frescor === 'critico', '/api/saude acusa base com mais de 72 h', `${s.status}/${s.frescor}`);
  conferir(r.headers.get('cache-control')?.includes('no-store'), '/api/saude sem cache');
}

// /api/resumo (P2-12): prévia no navegador diz que o envio está desligado e o que falta; envio só pelo agendamento.
{
  const r = await fetch(url('/api/resumo'));
  const html = await r.text();
  conferir(r.status === 200 && html.includes('Envio desligado') && html.includes('RESEND_API_KEY'), '/api/resumo mostra a prévia e o que falta configurar', `status ${r.status}`);
  conferir(html.includes('Radar Velora') && !/@/.test(html.replace(/RESUMO_DE|RESUMO_PARA/g, '')), '/api/resumo sem e-mail de pessoa na prévia');
  const p = await fetch(url('/api/resumo'), { method: 'POST', headers: { 'x-radar-agendado': 'chute' } });
  conferir(p.status === 403, 'envio do resumo recusa chamada de fora do agendamento', `status ${p.status}`);
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
    const r = await fetch(`http://127.0.0.1:${portaApp + 1}/api/saude`);
    const s = await r.json().catch(() => ({}));
    const saudeOk = r.status === 503 && s.motivo === 'nao_configurada';
    console.log(`${saudeOk ? 'ok    ' : 'FALHOU'}  sem SUPABASE_URL, /api/saude responde 503 nao_configurada${saudeOk ? '' : `  → ${r.status} ${s.motivo}`}`);
    if (!saudeOk) falhas++;
    break;
  } catch {
    await new Promise(r => setTimeout(r, 500));
  }
}
semBase.kill('SIGTERM');
if (!semBaseOk) falhas++;

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTodas as verificações passaram.');
if (falhas) console.error(app.log.slice(-4000));
encerrar(falhas ? 1 : 0);
