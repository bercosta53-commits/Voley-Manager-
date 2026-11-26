import type { Conta, Pessoa, Sinal } from './tipos';
import { rotuloPapel, papelNoComite, faltandoNoComite } from './papeis';
import { contatoBloqueado, rotuloValidacao } from './tese';
import { textoVariacao } from './caixa';
import { OFERTAS, oportunidadeDe, pessoasParaPlaybook, type Ativacao } from './playbooks';

/**
 * Briefing de reunião (backlog P3-6): o resumo da conta para levar a uma conversa, com cada afirmação ligada à
 * fonte. Regras:
 * - Fato só entra com fonte: sinal com veículo (e link, quando há), dado cadastral com a carga do Radar como
 *   origem, score com o motor VSCS como origem. O que a base não traz não aparece (nada é inferido).
 * - Recomendação (playbook, oferta Velora, perguntas) fica numa seção à parte e é rotulada como recomendação:
 *   não é fato sobre a empresa.
 * - Nenhum e-mail, telefone ou LinkedIn de pessoa: o briefing pode ser impresso ou encaminhado.
 * Função pura; testes em scripts/tests/briefing.test.mjs.
 */

export interface Fonte {
  n: number;
  rotulo: string;
  url?: string;
  data?: string;
}

/** Uma afirmação com as fontes que a sustentam (números da lista de fontes). */
export interface Linha {
  texto: string;
  detalhe?: string;
  fontes: number[];
  data?: string;
}

export interface Briefing {
  titulo: string;
  geradoEm: string;
  dataCarga: string;
  empresa: Linha[];
  fatos: Linha[];
  momento: Linha[];
  pessoas: Linha[];
  faltando: string[];
  /** recomendação do Radar, não fato */
  roteiro: {
    playbook?: string;
    leitura?: string;
    angulo?: string;
    perguntas: string[];
    evitar?: string;
    ofertas: string[];
    base: 'playbook' | 'sinal' | null;
  };
  fontes: Fonte[];
}

const DIAS_FATOS = 120;
const MAX_FATOS = 6;
const dia = (iso: string) => Date.parse(iso.slice(0, 10) + 'T12:00:00Z') / 86_400_000;
const br = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export function montarBriefing(conta: Conta, sinais: Sinal[], opcoes: { dataCarga: string; hoje: string; playbook?: Ativacao | null }): Briefing {
  const fontes: Fonte[] = [];
  const chave = new Map<string, number>();
  /** mesma URL = mesma fonte; sem URL, cada fato tem a sua (dois fatos do mesmo veículo no mesmo dia não se fundem) */
  function citar(rotulo: string, url?: string, data?: string, fato?: string) {
    const k = url || `${rotulo}|${data ?? ''}|${fato ?? ''}`;
    const ja = chave.get(k);
    if (ja) return ja;
    const n = fontes.length + 1;
    fontes.push({ n, rotulo, url: url || undefined, data });
    chave.set(k, n);
    return n;
  }
  const carga = () => citar(`Cadastro da conta no Radar (carga de ${br(opcoes.dataCarga)})`, undefined, opcoes.dataCarga);
  const motor = () => citar(`VSCS ${conta.v2?.versao ?? ''} calculado pelo motor do Radar (carga de ${br(opcoes.dataCarga)})`.replace('  ', ' '), undefined, opcoes.dataCarga);

  // 1. a empresa: só o que o cadastro traz
  const empresa: Linha[] = [];
  if (conta.oQueFaz) empresa.push({ texto: conta.oQueFaz, fontes: [carga()] });
  const ramo = conta.ramoTI?.nome ?? conta.segmento;
  const onde = [conta.cidade, conta.uf].filter(Boolean).join('/');
  const perfil = [ramo, onde && `sede em ${onde}`, conta.funcionariosFaixa ? `${conta.funcionariosFaixa} funcionários` : conta.funcionarios ? `${conta.funcionarios} funcionários` : '']
    .filter(Boolean)
    .join(' · ');
  if (perfil) empresa.push({ texto: perfil, fontes: [carga()] });
  if (conta.faturamentoEstimado) empresa.push({ texto: `Faturamento estimado: ${conta.faturamentoEstimado}`, fontes: [carga()] });
  const tier = conta.icp?.tier ?? conta.tier;
  if (tier) empresa.push({ texto: `ICP tier ${tier}`, detalhe: conta.icp?.motivos?.length ? conta.icp.motivos.join('; ') : undefined, fontes: [carga()] });

  // 2. o que aconteceu: fatos com fonte, do mais recente ao mais antigo
  const hoje = dia(opcoes.dataCarga);
  const fatos: Linha[] = sinais
    .filter(s => s.tipo !== 'noticia_setorial' && s.fonte && hoje - dia(s.data) >= 0 && hoje - dia(s.data) <= DIAS_FATOS)
    .sort((a, b) => b.data.localeCompare(a.data) || b.pontos - a.pontos)
    .slice(0, MAX_FATOS)
    .map(s => {
      const todas = s.fontes?.length ? s.fontes : [{ fonte: s.fonte, url: s.url, data: s.data }];
      const ns = [...new Set(todas.filter(f => f.fonte || f.url).map(f => citar(f.fonte || 'fonte sem nome', f.url, f.data || s.data, s.id)))];
      return {
        texto: s.sinal ?? s.porQueAgora,
        detalhe: s.categoria === 'negativo' ? 'sinal negativo' : s.rotulo,
        data: s.data.slice(0, 10),
        fontes: ns,
      };
    })
    .filter(l => l.fontes.length);

  // 3. momento: o score do motor, com estágio e variação
  const momento: Linha[] = [];
  if (Number.isFinite(conta.score)) {
    const v = textoVariacao(conta);
    momento.push({
      texto: `VSCS ${Math.round(conta.score)}${conta.vscsStatus ? `, ${conta.vscsStatus}` : ''}`,
      detalhe: v.curto,
      fontes: [motor()],
    });
  }
  const acao = conta.acaoRecomendada ?? conta.v2?.acao;
  if (acao)
    momento.push(
      conta.acaoDaMatriz
        ? { texto: `Ação pela matriz ICP × VSCS: ${acao}`, fontes: [citar('Matriz ICP × VSCS do Radar (a carga não trouxe a ação do motor)')] }
        : { texto: `Ação recomendada pelo motor: ${acao}`, fontes: [motor()] },
    );
  if (conta.scorePendente) momento.push({ texto: 'Score ainda não certificado pelo motor', fontes: [motor()] });

  // 4. pessoas: o comitê mapeado, sem contato pessoal
  const pessoas: Linha[] = [...conta.comite]
    .sort((a, b) => Number(contatoBloqueado(a)) - Number(contatoBloqueado(b)))
    .map((p: Pessoa) => ({
      texto: `${p.nome}, ${p.cargo}`,
      detalhe: [rotuloPapel(papelNoComite(p)), rotuloValidacao(p.statusValidacao)].filter(Boolean).join(' · ') || undefined,
      fontes: [citar(p.fonte ? `Comitê mapeado: ${p.fonte}` : 'Comitê mapeado no Radar')],
    }));
  const faltando = faltandoNoComite(conta);

  // 5. roteiro: recomendação do Radar
  const pb = opcoes.playbook ?? null;
  const principal = [...sinais].filter(s => s.categoria !== 'negativo' && s.tipo !== 'noticia_setorial').sort((a, b) => b.pontos - a.pontos)[0];
  const isolada = !pb && principal ? oportunidadeDe(principal) : null;
  const roteiro: Briefing['roteiro'] = pb
    ? {
        playbook: pb.playbook.nome,
        leitura: pb.playbook.leitura,
        angulo: pb.playbook.angulo,
        perguntas: [pb.playbook.descoberta],
        evitar: pb.playbook.naoDizer,
        ofertas: pb.playbook.ofertas.map(o => OFERTAS[o]),
        base: 'playbook',
      }
    : isolada
      ? { leitura: isolada.texto, perguntas: [], ofertas: isolada.ofertas.map(o => OFERTAS[o]), base: 'sinal' }
      : { perguntas: [], ofertas: [], base: null };
  if (pb) {
    const alvo = pessoasParaPlaybook(pb.playbook, conta.comite).filter(g => !g.pessoas.length).map(g => g.rotulo);
    if (alvo.length) roteiro.perguntas.push(`Quem ocupa hoje estes papéis: ${alvo.join('; ')}?`);
  }

  return {
    titulo: `Briefing de reunião: ${conta.nome}`,
    geradoEm: opcoes.hoje,
    dataCarga: opcoes.dataCarga,
    empresa,
    fatos,
    momento,
    pessoas,
    faltando,
    roteiro,
    fontes,
  };
}

/** O briefing em texto simples, para colar num e-mail ou no CRM, com as fontes numeradas no fim. */
export function briefingEmTexto(b: Briefing): string {
  const cit = (ns: number[]) => (ns.length ? ' ' + ns.map(n => `[${n}]`).join('') : '');
  const linhas = (ls: Linha[]) => ls.map(l => `- ${l.data ? br(l.data) + ': ' : ''}${l.texto}${l.detalhe ? ` (${l.detalhe})` : ''}${cit(l.fontes)}`);
  const out: string[] = [b.titulo, `Dados de ${br(b.dataCarga)} · gerado em ${br(b.geradoEm)}`, ''];
  if (b.empresa.length) out.push('A EMPRESA', ...linhas(b.empresa), '');
  if (b.fatos.length) out.push('O QUE ACONTECEU', ...linhas(b.fatos), '');
  if (b.momento.length) out.push('MOMENTO', ...linhas(b.momento), '');
  if (b.pessoas.length || b.faltando.length) {
    out.push('PESSOAS', ...linhas(b.pessoas));
    if (b.faltando.length) out.push(`- Ainda sem nome no comitê: ${b.faltando.join(', ')}`);
    out.push('');
  }
  const r = b.roteiro;
  if (r.base) {
    out.push('ROTEIRO (recomendação do Radar, não é fato)');
    if (r.playbook) out.push(`- Playbook: ${r.playbook}`);
    if (r.leitura) out.push(`- Leitura: ${r.leitura}`);
    if (r.angulo) out.push(`- Ângulo: ${r.angulo}`);
    for (const p of r.perguntas) out.push(`- Pergunta: ${p}`);
    if (r.evitar) out.push(`- Evite: ${r.evitar}`);
    if (r.ofertas.length) out.push(`- Velora oferece: ${r.ofertas.join(', ')}`);
    out.push('');
  }
  out.push('FONTES', ...b.fontes.map(f => `[${f.n}] ${f.rotulo}${f.data && !f.rotulo.includes(br(f.data)) ? `, ${br(f.data)}` : ''}${f.url ? ` · ${f.url}` : ''}`));
  return out.join('\n');
}
