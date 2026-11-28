import { pontosDe } from './utils';
import type { Base } from './tipos';
import { analisarConta, NIVEIS, type DadosAquisicao } from './aquisicao-maturidade';
import { dimensaoClima, dimensaoDigital, dimensaoIcp, dimensaoSinais, type AuditoriaDigital, type ClimaDaConta, type PulsoDaConta } from './prioridade';
import { nivelVertical, verticalDaConta, type DadosClima } from './clima';
import { leituraPulso } from './clima-pulso';
import { modoClimaDoAmbiente } from './prioridade-config';
import { DIMENSOES, type ModoClima } from './prioridade-config';
import { compactarDimensao, type LinhaTransporte } from './prioridade-transporte';

/**
 * Monta as linhas da tela Prioridade de contas no servidor: só o que a tela usa, em vez da base inteira
 * (o navegador recebe uma linha curta por conta). A Oportunidade digital vem da auditoria web, ligada pelo domínio.
 */
const dominio = (d?: string) => (d ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

/**
 * Fonte da Oportunidade digital: o Atlas de aquisição do snapshot privado (payload.aquisicaoAtlas, a mesma fonte da
 * tela Aquisição) quando existe; sem ele, o arquivo público do repositório.
 */
export function fonteAquisicao(base: Base, arquivo: DadosAquisicao): DadosAquisicao {
  const atlas = (base as Base & { aquisicaoAtlas?: DadosAquisicao }).aquisicaoAtlas;
  return atlas?.accounts?.length ? atlas : arquivo;
}

/** Auditorias por domínio e por id da conta ("id:<id>"): o Atlas usa o id da base; o arquivo antigo, só o domínio. */
export function auditoriasPorDominio(dados: DadosAquisicao): Map<string, AuditoriaDigital> {
  const m = new Map<string, AuditoriaDigital>();
  for (const c of dados.accounts) {
    const a = analisarConta(c);
    const nivel = NIVEIS.find(n => n.nivel === a.nivel);
    const auditoria: AuditoriaDigital = {
      nivel: a.nivel,
      confianca: a.confianca,
      dataReferencia: c.lastScannedAt ?? dados.lastUpdated ?? null,
      fonte: c.evidence || null,
      resumo: nivel ? `L${a.nivel} · ${nivel.titulo}` : 'Não classificada',
    };
    if (c.domain) m.set(dominio(c.domain), auditoria);
    if (c.id) m.set(`id:${c.id}`, auditoria);
  }
  return m;
}

/** Clima por código de especialização, já com o nível S calculado uma vez por vertical. */
export function climaPorCodigo(dados: DadosClima | null | undefined): (codigo?: string | null) => ClimaDaConta | null {
  if (!dados?.verticais?.length) return () => null;
  const verticais = dados.verticais.map(v => ({ ...v, S: nivelVertical(dados, v).S }));
  const data = dados.atualizadoEm.slice(0, 10);
  return codigo => {
    const v = verticalDaConta(verticais, codigo);
    return v ? { nome: v.nome, estado: v.estado, S: v.S, confianca: v.confianca, dataReferencia: data, fontes: v.fontes } : null;
  };
}

export function linhasPrioridade(
  base: Base,
  auditorias: Map<string, AuditoriaDigital>,
  agora: Date,
  climaDe: (codigo?: string | null) => ClimaDaConta | null = () => null,
  /** Clima na nota: com o pulso das contas (lib/clima-pulso.ts) e o modo; sem pulso, o cálculo anterior */
  { pulsoDe, modoClima = 'media' }: { pulsoDe?: (contaId: string) => PulsoDaConta | null; modoClima?: ModoClima } = {},
): LinhaTransporte[] {
  const fatos = new Map<string, Base['sinais']>();
  for (const s of base.sinais) if (s.tipo !== 'noticia_setorial' && !s.exemplo) fatos.set(s.contaId, [...(fatos.get(s.contaId) ?? []), s]);
  return base.contas.map(c => {
    const daConta = (fatos.get(c.id) ?? []).sort((a, b) => pontosDe(b.pontos) - pontosDe(a.pontos));
    const forte = daConta[0];
    const dims = {
      icp: dimensaoIcp(c),
      sinais: dimensaoSinais(c, daConta.map(s => ({ data: s.data, url: s.url, fonte: s.fonte }))),
      clima: dimensaoClima(climaDe(c.especializacao?.codigo), agora, pulsoDe?.(c.id)),
      oportunidadeDigital: dimensaoDigital(auditorias.get(`id:${c.id}`) ?? auditorias.get(dominio(c.dominio)), agora),
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
      dims: Object.fromEntries(DIMENSOES.map(d => [d, compactarDimensao(d, dims[d])])) as LinhaTransporte['dims'],
      ...(modoClima !== 'media' && { modoClima }),
    };
  });
}

/**
 * Como o Clima entra na prioridade, decidido no servidor: modo pela variável RADAR_CLIMA_NA_NOTA (padrão:
 * ancorado) e o pulso de cada conta. Sem crescimento de equipe na base para medir o pulso, volta ao cálculo
 * anterior ('media'), para não ajustar a nota com um Clima que não foi medido.
 */
export function climaNaPrioridade(base: Base, dados: DadosClima | null | undefined, variavel = process.env.RADAR_CLIMA_NA_NOTA) {
  const modo = modoClimaDoAmbiente(variavel);
  if (modo === 'media' || !dados?.verticais?.length) return { modoClima: 'media' as const };
  const leitura = leituraPulso(
    base as unknown as Parameters<typeof leituraPulso>[0],
    dados.verticais.map(v => ({ id: v.id, nome: v.nome, codigos: v.codigos, S: nivelVertical(dados, v).S })),
  );
  if (!leitura.disponivel) return { modoClima: 'media' as const };
  return { modoClima: modo, pulsoDe: (id: string) => leitura.porConta[id] ?? null };
}
