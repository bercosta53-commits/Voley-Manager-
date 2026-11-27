import { pontosDe } from './utils';
import type { Base, EstadoSinal, Sinal } from './tipos';
import type { StatusConta } from './acoes';
import { frescor, rotuloCarga, rotuloIdade } from './frescor';
import { lideranca } from './lideranca';

/**
 * Resumo diário (P2-12): o valor do Radar chegando a quem não abre o app. As contas que tiveram fato novo
 * desde a véspera da carga, com evidência; as que viraram Conta Qualificada; e, com o registro compartilhado,
 * as quentes ainda sem ação do time. Só empresas e fatos: nenhum nome ou e-mail de pessoa. Se a base estiver
 * atrasada, o resumo diz isso primeiro, em vez de repetir notícia velha como se fosse nova.
 * Função pura; testes em scripts/tests/resumo.test.mjs. Envio em app/api/resumo/route.ts.
 */

export interface ItemResumo {
  contaId: string;
  nome: string;
  score: number;
  estagio?: string;
  fato: string;
  fonte?: string;
  url?: string;
  acao?: string;
  mais: number;
}

export interface Resumo {
  assunto: string;
  dataCarga: string;
  atrasada: boolean;
  mudaram: ItemResumo[];
  mudaramTotal: number;
  qualificadas: { contaId: string; nome: string; motivo?: string }[];
  semAcao: { contaId: string; nome: string; fato: string }[] | null;
  texto: string;
  html: string;
}

const dia = (iso: string) => Date.parse(iso.slice(0, 10) + 'T12:00:00Z') / 86_400_000;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/');
const linkSeguro = (u?: string) => (u && /^https?:\/\//i.test(u) ? u : undefined);

export function resumoDiario(
  base: Base,
  {
    agora,
    appUrl = '',
    estados = {},
    status = {},
    compartilhado = false,
    limite = 5,
  }: {
    agora: Date;
    appUrl?: string;
    estados?: Record<string, EstadoSinal>;
    status?: Record<string, { status: StatusConta }>;
    compartilhado?: boolean;
    limite?: number;
  },
): Resumo {
  const carga = base.atualizadoEm ?? base.geradoEm;
  const dataCarga = carga.slice(0, 10);
  const { nivel, horas } = frescor(carga, agora);
  const atrasada = nivel === 'atencao' || nivel === 'critico';
  const hoje = dia(dataCarga);

  // fato novo = data do fato ou do aviso na véspera da carga ou depois (a carga roda às 00h30)
  const novo = (s: Sinal) => s.tipo !== 'noticia_setorial' && !s.exemplo && hoje - dia(s.alertaEm || s.data) <= 1 && hoje - dia(s.alertaEm || s.data) >= 0;
  const porConta = new Map<string, Sinal[]>();
  for (const s of base.sinais) if (novo(s)) porConta.set(s.contaId, [...(porConta.get(s.contaId) ?? []), s]);
  const contas = new Map(base.contas.map(c => [c.id, c]));
  const mudaramTodos = [...porConta.entries()]
    .filter(([id]) => contas.has(id))
    .map(([id, ss]): ItemResumo => {
      const c = contas.get(id)!;
      const forte = [...ss].sort((a, b) => pontosDe(b.pontos) - pontosDe(a.pontos))[0]!;
      return {
        contaId: id,
        nome: c.nome,
        score: Math.round(c.score),
        estagio: c.vscsStatus,
        fato: forte.sinal || forte.porQueAgora || forte.rotulo,
        fonte: forte.fonte,
        url: linkSeguro(forte.url),
        acao: c.acaoRecomendada,
        mais: ss.length - 1,
      };
    })
    .sort((a, b) => b.score - a.score);
  const mudaram = mudaramTodos.slice(0, limite);

  const qualificadas = base.contas
    .filter(c => c.qualificada?.status === 'sim' && c.qualificada.desde && hoje - dia(c.qualificada.desde) <= 1 && hoje - dia(c.qualificada.desde) >= 0)
    .map(c => ({ contaId: c.id, nome: c.nome, motivo: c.qualificada?.motivo }));

  const semAcao = compartilhado ? lideranca(base, estados, status, { limite: 3 }).quentesSemAcao.map(c => ({ contaId: c.contaId, nome: c.nome, fato: c.fato })) : null;

  const assunto = atrasada
    ? `Radar Velora · base de ${dataBr(dataCarga)} ainda não foi atualizada`
    : `Radar Velora · ${dataBr(dataCarga)}: ${mudaramTodos.length ? `${mudaramTodos.length} ${mudaramTodos.length === 1 ? 'conta mudou' : 'contas mudaram'}` : 'nenhum fato novo'}`;

  const raiz = appUrl.replace(/\/$/, '');
  const linkConta = (id: string) => (raiz ? `${raiz}/contas/${encodeURIComponent(id)}` : '');
  const aviso = atrasada ? `Atenção: a base é de ${rotuloCarga(carga)} (${rotuloIdade(horas)}). Os fatos abaixo podem não ser novos.` : '';

  // texto puro (cliente de e-mail sem HTML)
  const t: string[] = [assunto, ''];
  if (aviso) t.push(aviso, '');
  t.push(mudaram.length ? 'O que mudou desde ontem:' : 'Nenhuma conta teve fato novo desde ontem.');
  for (const m of mudaram)
    t.push(`- ${m.nome} (VSCS ${m.score}${m.estagio ? `, ${m.estagio}` : ''}): ${m.fato}${m.fonte ? ` [${m.fonte}${m.url ? ` ${m.url}` : ''}]` : ''}${m.acao ? ` → ${m.acao}` : ''}${m.mais ? ` (+${m.mais})` : ''}`);
  if (mudaramTodos.length > mudaram.length) t.push(`  e mais ${mudaramTodos.length - mudaram.length} no Radar.`);
  if (qualificadas.length) t.push('', 'Viraram Conta Qualificada:', ...qualificadas.map(q => `- ${q.nome}${q.motivo ? `: ${q.motivo}` : ''}`));
  if (semAcao?.length) t.push('', 'Quentes e ainda sem ação do time:', ...semAcao.map(s => `- ${s.nome}: ${s.fato}`));
  if (raiz) t.push('', `Abrir o Radar: ${raiz}/`);
  const texto = t.join('\n');

  // HTML simples, estilos inline (clientes de e-mail ignoram <style>), tudo escapado
  const p = (s: string, estilo = '') => `<p style="margin:0 0 8px;${estilo}">${s}</p>`;
  const a = (href: string, s: string) => `<a href="${esc(href)}" style="color:#1d1b18">${esc(s)}</a>`;
  const h: string[] = [
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d1b18;max-width:560px">`,
    p(`<strong style="font-size:16px">${esc(assunto)}</strong>`),
  ];
  if (aviso) h.push(p(esc(aviso), 'background:#fbeee0;padding:8px 10px;border-radius:6px'));
  h.push(p(mudaram.length ? '<strong>O que mudou desde ontem</strong>' : 'Nenhuma conta teve fato novo desde ontem.'));
  if (mudaram.length) {
    h.push('<ul style="margin:0 0 12px;padding-left:18px">');
    for (const m of mudaram)
      h.push(
        `<li style="margin-bottom:8px">${linkConta(m.contaId) ? a(linkConta(m.contaId), m.nome) : esc(m.nome)} · VSCS ${m.score}${m.estagio ? ` · ${esc(m.estagio)}` : ''}<br>` +
          `${esc(m.fato)}${m.fonte ? ` <span style="color:#6b665e">(${m.url ? a(m.url, m.fonte) : esc(m.fonte)})</span>` : ''}` +
          `${m.acao ? `<br><span style="color:#6b665e">Próxima ação: ${esc(m.acao)}</span>` : ''}${m.mais ? ` <span style="color:#6b665e">· mais ${m.mais}</span>` : ''}</li>`,
      );
    h.push('</ul>');
    if (mudaramTodos.length > mudaram.length) h.push(p(`e mais ${mudaramTodos.length - mudaram.length} no Radar.`, 'color:#6b665e'));
  }
  if (qualificadas.length)
    h.push(p('<strong>Viraram Conta Qualificada</strong>'), `<ul style="margin:0 0 12px;padding-left:18px">${qualificadas.map(q => `<li>${esc(q.nome)}${q.motivo ? `: ${esc(q.motivo)}` : ''}</li>`).join('')}</ul>`);
  if (semAcao?.length)
    h.push(p('<strong>Quentes e ainda sem ação do time</strong>'), `<ul style="margin:0 0 12px;padding-left:18px">${semAcao.map(s => `<li>${esc(s.nome)}: ${esc(s.fato)}</li>`).join('')}</ul>`);
  if (raiz) h.push(p(a(`${raiz}/`, 'Abrir o Radar')));
  h.push('</div>');

  return { assunto, dataCarga, atrasada, mudaram, mudaramTotal: mudaramTodos.length, qualificadas, semAcao, texto, html: h.join('') };
}
