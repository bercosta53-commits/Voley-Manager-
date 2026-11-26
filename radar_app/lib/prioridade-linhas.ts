import type { Base } from './tipos';
import { analisarConta, NIVEIS, type DadosAquisicao } from './aquisicao-maturidade';
import { dimensaoClima, dimensaoDigital, dimensaoIcp, dimensaoSinais, visaoIntegrada, type AuditoriaDigital, type VisaoIntegradaConta } from './prioridade';
import type { LinhaPrioridade } from './prioridade-filtros';

/**
 * Monta as linhas da tela Prioridade de contas no servidor: só o que a tela usa, em vez da base inteira
 * (o navegador recebe uma linha curta por conta). A Oportunidade digital vem da auditoria web, ligada pelo domínio.
 */
const dominio = (d?: string) => (d ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

export function auditoriasPorDominio(dados: DadosAquisicao): Map<string, AuditoriaDigital> {
  const m = new Map<string, AuditoriaDigital>();
  for (const c of dados.accounts) {
    const a = analisarConta(c);
    const nivel = NIVEIS.find(n => n.nivel === a.nivel);
    m.set(dominio(c.domain), {
      nivel: a.nivel,
      confianca: a.confianca,
      dataReferencia: c.lastScannedAt ?? dados.lastUpdated ?? null,
      fonte: c.evidence || null,
      resumo: nivel ? `L${a.nivel} · ${nivel.titulo}` : 'Não classificada',
    });
  }
  return m;
}

export function linhasPrioridade(base: Base, auditorias: Map<string, AuditoriaDigital>, agora: Date): LinhaPrioridade[] {
  const fatos = new Map<string, Base['sinais']>();
  for (const s of base.sinais) if (s.tipo !== 'noticia_setorial' && !s.exemplo) fatos.set(s.contaId, [...(fatos.get(s.contaId) ?? []), s]);
  return base.contas.map(c => {
    const daConta = (fatos.get(c.id) ?? []).sort((a, b) => b.pontos - a.pontos);
    const forte = daConta[0];
    const dims = {
      icp: dimensaoIcp(c),
      sinais: dimensaoSinais(c, daConta.map(s => ({ data: s.data, url: s.url, fonte: s.fonte }))),
      clima: dimensaoClima(),
      oportunidadeDigital: dimensaoDigital(auditorias.get(dominio(c.dominio)), agora),
    };
    return {
      contaId: c.id,
      nome: c.nome,
      outrosNomes: [c.razaoSocial].filter((x): x is string => !!x && x !== c.nome),
      setor: c.ramoTI?.nome ?? (c.segmento || null),
      uf: c.uf ?? '',
      tier: c.icp?.tier ?? c.tier ?? '',
      evidencia: forte ? { texto: forte.sinal || forte.porQueAgora || forte.rotulo, fonte: forte.fonte || null, url: /^https?:\/\//i.test(forte.url) ? forte.url : null, data: forte.data } : null,
      acaoOficial: c.acaoRecomendada ?? null,
      acaoDaMatriz: !!c.acaoDaMatriz,
      visao: compactar(visaoIntegrada(c.id, dims)),
    };
  });
}

/**
 * S-1: o navegador recebe uma linha por conta, então tira o que é igual em todas e já está na configuração
 * (origem de cada nota, motivo fixo do Clima) e o motivo de exclusão quando repete o resumo.
 */
function compactar(v: VisaoIntegradaConta): VisaoIntegradaConta {
  const dimensoes = Object.fromEntries(
    Object.entries(v.dimensoes).map(([d, x]) => {
      const { origem: _, ...resto } = x;
      const fixo = d === 'clima' && x.motivoSemNota === 'metodo_nao_mapeado';
      return [d, { ...resto, resumo: fixo ? null : x.resumo, motivoExclusao: fixo || x.motivoExclusao === x.resumo ? null : x.motivoExclusao }];
    }),
  ) as VisaoIntegradaConta['dimensoes'];
  return { ...v, dimensoes };
}
