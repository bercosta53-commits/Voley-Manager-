// Simulação do OGI como 5ª dimensão sobre um snapshot exportado do Supabase (SELECT payload ... id='current').
// SÓ LEITURA: não escreve no banco nem no snapshot; o relatório sai numa pasta FORA do repositório, porque traz
// nomes e classes reais (dados privados da Velora não vão para o GitHub).
//
// Uso:
//   node --experimental-strip-types --import ./scripts/tests/resolver.mjs scripts/simular-ogi.mjs \
//     --snapshot /caminho/payload.json --saida /pasta/privada [--data AAAA-MM-DD]
// O arquivo pode ser o payload puro ou a resposta do SQL ([{ "payload": {...} }]).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dimensaoClima, dimensaoDigital, dimensaoIcp, dimensaoSinais } from '../lib/prioridade.ts';
import { auditoriasPorDominio, climaPorCodigo, fonteAquisicao } from '../lib/prioridade-linhas.ts';
import { DIMENSOES } from '../lib/prioridade-config.ts';
import { notaOgi, resultadosOgi, ROTULO_ESTADO_OGI } from '../lib/ogi.ts';
import { classeAtual, classificarComOgi, movimento, notaComOgi, resumir } from '../lib/simulacao-ogi.ts';
import { notaIntegrada } from '../lib/prioridade.ts';

const RAIZ_REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const arg = n => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const snapshot = arg('snapshot');
const saida = arg('saida');
if (!snapshot || !saida) {
  console.error('Uso: simular-ogi.mjs --snapshot payload.json --saida /pasta/privada [--data AAAA-MM-DD]');
  process.exit(2);
}
const rel = relative(RAIZ_REPO, resolve(saida));
if (!rel.startsWith('..') && !isAbsolute(rel)) {
  console.error('A saída precisa ficar fora do repositório (o relatório traz dados reais).');
  process.exit(2);
}

let bruto = JSON.parse(readFileSync(snapshot, 'utf8'));
if (Array.isArray(bruto)) bruto = bruto[0]?.payload ?? bruto[0];
if (bruto?.payload && !bruto.contas) bruto = bruto.payload;
const base = bruto;
if (!Array.isArray(base?.contas)) throw new Error('Snapshot sem contas.');
if (base.ficticia) throw new Error('Snapshot marcado como fictício: a simulação só roda sobre a base real.');

const raiz = fileURLToPath(new URL('..', import.meta.url));
const ler = f => JSON.parse(readFileSync(resolve(raiz, f), 'utf8'));
const agora = new Date(arg('data') ? `${arg('data')}T12:00:00Z` : base.atualizadoEm || base.geradoEm || Date.now());
const referencia = agora.toISOString().slice(0, 10);
const auditorias = auditoriasPorDominio(fonteAquisicao(base, ler('data/aquisicao.json')));
const climaDe = climaPorCodigo(ler('data/clima.json'));
const resultados = resultadosOgi(base);
const dominio = d => (d ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

const sinaisPorConta = new Map();
for (const s of base.sinais ?? []) if (!s.exemplo) sinaisPorConta.set(s.contaId, [...(sinaisPorConta.get(s.contaId) ?? []), s]);

// variantes testadas: confiabilidade (com/sem), desconto por causa comum (0 / 0,5 / 1), escala (45 / 90)
const VARIANTES = [
  { id: 'padrao', rotulo: 'Ancorado no neutro (padrão) · confiabilidade aplicada · desconto 0,5 · escala 45', o: {}, modo: 'ancorado' },
  { id: 'media', rotulo: 'Média ponderada (comparação)', o: {}, modo: 'media' },
  { id: 'sem_dedup', rotulo: 'Sem deduplicação', o: { descontoCausaComum: 0 }, modo: 'ancorado' },
  { id: 'dedup_total', rotulo: 'Causa comum zera o afastamento', o: { descontoCausaComum: 1 }, modo: 'ancorado' },
  { id: 'sem_conf', rotulo: 'Sem confiabilidade (força cheia)', o: { usarConfiabilidade: false }, modo: 'ancorado' },
  { id: 'escala_90', rotulo: 'Escala 90 (metade da inclinação)', o: { escala: 90 }, modo: 'ancorado' },
];

const notasAtuais = c => {
  const fatos = (sinaisPorConta.get(c.id) ?? []).filter(s => s.tipo !== 'noticia_setorial');
  const dims = {
    icp: dimensaoIcp(c),
    sinais: dimensaoSinais(c, fatos.map(s => ({ data: s.data, url: s.url, fonte: s.fonte }))),
    clima: dimensaoClima(climaDe(c.especializacao?.codigo), agora),
    oportunidadeDigital: dimensaoDigital(auditorias.get(`id:${c.id}`) ?? auditorias.get(dominio(c.dominio)), agora),
  };
  return Object.fromEntries(DIMENSOES.flatMap(d => (dims[d].nota !== null && dims[d].entraNoCalculo ? [[d, dims[d].nota]] : [])));
};

const r2 = v => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
const porVariante = {};
const detalhe = [];
for (const v of VARIANTES) {
  const linhas = [];
  for (const c of base.contas) {
    const n = notasAtuais(c);
    const o = notaOgi(resultados[c.id], { ...v.o, sinais: sinaisPorConta.get(c.id) ?? [], referencia: resultados[c.id]?.consultadoEm?.slice(0, 10) || referencia });
    const antes = classeAtual(n);
    const depois = classificarComOgi(n, o.nota, { modo: v.modo });
    const notaAntes = Object.keys(n).length ? notaIntegrada(n) : null;
    linhas.push({ contaId: c.id, antes, depois, notaAntes, notaDepois: notaComOgi(n, o.nota, 1, v.modo), movimento: movimento(antes, depois) });
    if (v.id === 'padrao' || v.id === 'media')
      detalhe.push({
        variante: v.id,
        id: c.id, nome: c.nome, tier: c.icp?.tier ?? c.tier ?? '', vscs: c.score ?? null, estado: o.estado, ogiNota: o.nota, ogiForca: o.forca,
        provisoria: o.provisoria, deduplicacao: o.deduplicacao, classeAntes: antes, classeDepois: depois, notaAntes: r2(notaAntes), notaDepois: r2(notaComOgi(n, o.nota, 1, v.modo)),
        movimento: movimento(antes, depois), delta365: resultados[c.id]?.delta365 ?? null, total: resultados[c.id]?.total ?? null,
      });
  }
  porVariante[v.id] = { rotulo: v.rotulo, ...resumir(linhas) };
}

const estados = {};
for (const d of detalhe.filter(x => x.variante === 'padrao')) estados[d.estado] = (estados[d.estado] ?? 0) + 1;
const out = {
  aviso: 'PRIVADO — simulação; não altera VSCS, classe, Tier nem a tela. Não publicar.',
  referencia, scoreVersao: base.scoreVersao ?? null, contas: base.contas.length, sinais: (base.sinais ?? []).length,
  contasComResultadoOgi: Object.keys(resultados).length, estados, variantes: porVariante, contasDetalhe: detalhe,
};
if (!existsSync(saida)) mkdirSync(saida, { recursive: true });
writeFileSync(resolve(saida, 'simulacao-ogi.json'), JSON.stringify(out, null, 2));

// resumo legível
const fmt = n => (n === null ? '—' : String(n).replace('.', ','));
const md = [`# Simulação do OGI como 5ª dimensão (PRIVADO)`, '', `Referência ${referencia} · ${base.scoreVersao ?? 'versão não informada'} · ${out.contas} contas · ${out.sinais} sinais · ${out.contasComResultadoOgi} resultados OGI`, ''];
md.push('## Estado do OGI por conta', '', ...Object.entries(estados).map(([e, n]) => `- ${ROTULO_ESTADO_OGI[e]}: ${n}`), '');
md.push('## Variantes', '', '| Variante | Sobe | Desce | Igual | Entra | Sai | Sweet spot antes → depois |', '|---|---|---|---|---|---|---|');
for (const v of Object.values(porVariante)) md.push(`| ${v.rotulo} | ${v.porMovimento.sobe} | ${v.porMovimento.desce} | ${v.porMovimento.igual} | ${v.porMovimento.entra} | ${v.porMovimento.sai} | ${v.sweetAntes} → ${v.sweetDepois} |`);
const p = porVariante.padrao;
const cl = ['A1', 'A2', 'B1', 'B2', 'C', 'sem'];
md.push('', '## Matriz de classes (variante padrão; linhas = hoje, colunas = simulado)', '', `| | ${cl.join(' | ')} |`, `|---|${cl.map(() => '---').join('|')}|`);
for (const a of cl) md.push(`| **${a}** | ${cl.map(b => p.matriz[a][b] || '·').join(' | ')} |`);
for (const vid of ['padrao', 'media']) {
  const mov = detalhe.filter(d => d.variante === vid && d.movimento !== 'igual').sort((a, b) => Math.abs((b.notaDepois ?? 0) - (b.notaAntes ?? 0)) - Math.abs((a.notaDepois ?? 0) - (a.notaAntes ?? 0)));
  md.push('', `## Contas que mudam de classe (${porVariante[vid].rotulo})`, '', '| Conta | Tier | VSCS | OGI | Estado | Classe | Nota | Causa comum |', '|---|---|---|---|---|---|---|---|');
  for (const d of mov) md.push(`| ${d.nome} | ${d.tier} | ${fmt(d.vscs)} | ${fmt(d.ogiNota)}${d.provisoria ? '*' : ''} | ${ROTULO_ESTADO_OGI[d.estado]} | ${d.classeAntes ?? '—'} → ${d.classeDepois ?? '—'} | ${fmt(d.notaAntes)} → ${fmt(d.notaDepois)} | ${d.deduplicacao ? d.deduplicacao.causa : ''} |`);
}
md.push('', '\\* nota provisória (confiabilidade abaixo de 1).');
writeFileSync(resolve(saida, 'simulacao-ogi.md'), md.join('\n'));
console.log(`OK: ${resolve(saida, 'simulacao-ogi.md')}`);
console.log(JSON.stringify({ estados, padrao: { ...p, matriz: undefined } }));
