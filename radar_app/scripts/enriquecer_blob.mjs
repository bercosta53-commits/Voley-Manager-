// Aplica um arquivo de enriquecimento (data/enriquecimento.local.json) na base real do Radar.
// - Com data/contas.local.json presente: grava nele.
// - Senão: lê/grava contas.local.json no Vercel Blob privado (precisa de BLOB_READ_WRITE_TOKEN;
//   pegue com `npx vercel env pull .env.local` e rode com `node --env-file=.env.local ...`).
// Sempre salva um backup antes de gravar. Uso:
//   node --env-file=.env.local scripts/enriquecer_blob.mjs data/enriquecimento.local.json [--seco]
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [arquivo = 'data/enriquecimento.local.json'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const seco = process.argv.includes('--seco');
const LOCAL = path.join('data', 'contas.local.json');
const CHAVE = 'contas.local.json';
const LUGARES = { assina_cheque: 'Assina o cheque', decisor: 'Decisor', dono_da_dor: 'Dono da dor' };
const norm = t => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function lerBase() {
  if (existsSync(LOCAL)) return { base: JSON.parse(await readFile(LOCAL, 'utf8')), onde: 'local' };
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Sem data/contas.local.json e sem BLOB_READ_WRITE_TOKEN.');
  const { get } = await import('@vercel/blob');
  const r = await get(CHAVE, { access: 'private' });
  if (!r?.stream) throw new Error('contas.local.json não encontrado no Blob.');
  return { base: JSON.parse(await new Response(r.stream).text()), onde: 'blob' };
}

async function gravarBase(base, onde) {
  const texto = JSON.stringify(base, null, 1);
  if (onde === 'local') return writeFile(LOCAL, texto);
  const { put } = await import('@vercel/blob');
  await put(CHAVE, texto, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
}

const enr = JSON.parse(await readFile(arquivo, 'utf8'));
const { base, onde } = await lerBase();
const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
await writeFile(path.join('data', `contas.backup-${carimbo}.local.json`), JSON.stringify(base));

for (const e of enr.contas) {
  const conta = base.contas.find(c => norm(c.dominio).replace(/^www\./, '') === norm(e.dominio));
  if (!conta) { console.warn(`! conta ${e.dominio} não está na base — pulei`); continue; }
  Object.assign(conta, e.campos ?? {});
  conta.comite ??= [];
  for (const p of e.comite ?? []) {
    const atual = conta.comite.find(q => norm(q.nome) === norm(p.nome));
    if (atual) Object.assign(atual, p); else conta.comite.push(p);
  }
  conta.historico ??= [];
  for (const h of e.historico ?? []) {
    if (!conta.historico.some(x => x.tipo === h.tipo && x.data === h.data && x.porQueAgora === h.porQueAgora)) conta.historico.push(h);
  }
  conta.historico.sort((a, b) => b.data.localeCompare(a.data));
  conta.comiteFaltando = Object.keys(LUGARES).filter(l => !conta.comite.some(p => p.papelAbm === l || p.papeisExtras?.includes(l))).map(l => LUGARES[l]);
  console.log(`✓ ${conta.nome}: ${conta.comite.length} no comitê, ${conta.historico.length} fatos, faltando: ${conta.comiteFaltando.join(', ') || 'nada'}`);
}

if (seco) console.log('(--seco: nada gravado)');
else { await gravarBase(base, onde); console.log(`Gravado em ${onde === 'local' ? LOCAL : 'Vercel Blob/' + CHAVE}. Backup em data/contas.backup-${carimbo}.local.json`); }
