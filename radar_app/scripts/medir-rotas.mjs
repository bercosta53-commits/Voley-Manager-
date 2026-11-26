// P0-8 / P1-12: mede cada tela com uma base: tamanho do HTML (com o payload que vai ao navegador) e tempo de
// resposta do servidor (mediana de 5). Sem argumento, usa a base fictícia dos testes multiplicada para 350
// contas. Com um arquivo, usa o snapshot exportado (o mesmo `payload` de radar_snapshots):
//   node scripts/medir-rotas.mjs caminho/para/snapshot.json
// O snapshot real nunca deve ir para o repositório: guarde fora dele (ex.: /tmp) e apague depois.
import fs from 'node:fs';
import { baseDeTeste, subirApp } from './app-de-teste.mjs';

async function baseFicticia() {
  const b0 = await baseDeTeste();
  const contas = [], sinais = [];
  for (let i = 0; i < 35; i++) {
    for (const c of b0.contas) contas.push({ ...c, id: `${c.id}-${i}`, nome: i ? `${c.nome} ${i}` : c.nome });
    for (const s of b0.sinais.filter(x => !x.exemplo)) sinais.push({ ...s, id: `${s.id}-${i}`, contaId: `${s.contaId}-${i}` });
  }
  return { ...b0, contas, sinais, atualizadoEm: new Date().toISOString() };
}

const arquivo = process.argv[2];
const base = arquivo ? JSON.parse(fs.readFileSync(arquivo, 'utf8')) : await baseFicticia();
const snapshot = base.payload ?? base; // aceita a linha de radar_snapshots ou só o payload
const app = await subirApp(snapshot);
const primeira = snapshot.contas[0]?.id;
const rotas = ['/', '/radar', '/radar/proximidade', '/contas', primeira && `/contas/${primeira}`, '/decisores', '/fontes', '/metricas', '/aquisicao', '/icp', '/clima', '/api/saude'].filter(Boolean);
const kb = n => (n / 1024).toFixed(0).padStart(6);
console.log(`base: ${arquivo ? 'snapshot informado' : 'fictícia'} · ${snapshot.contas.length} contas · ${snapshot.sinais.length} sinais · ${kb(JSON.stringify(snapshot).length)} KB de JSON\n`);
console.log('    KB      ms  rota');
for (const r of rotas) {
  let corpo = '';
  for (let i = 0; i < 60 && !corpo; i++) {
    try {
      const res = await fetch(app.url(r));
      if (res.status < 500) corpo = await res.text();
    } catch {}
    if (!corpo) await new Promise(x => setTimeout(x, 500));
  }
  const tempos = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await (await fetch(app.url(r))).text();
    tempos.push(performance.now() - t0);
  }
  tempos.sort((a, b) => a - b);
  console.log(`${kb(corpo.length)}  ${tempos[2].toFixed(0).padStart(6)}  ${r}`);
}
console.log('\nTempo medido no next start local (Node), não no Worker: serve para comparar telas e versões, não como CPU do plano gratuito.');
app.parar?.();
process.exit(0);
