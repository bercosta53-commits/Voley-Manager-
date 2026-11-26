/**
 * Leitura do mercado: os fatos das contas somados por grupo (família ou ramo de TI, ou vertical do cliente),
 * por tema e por mês, com o tema que está acima da média da base em cada grupo e as sequências de movimentos
 * que se repetem nas contas. Só conta fatos registrados e sempre devolve os fatos que sustentam cada número.
 * Função pura; testes em scripts/tests/mercado.test.mjs.
 */
import { temaDoFato, TEMAS, type Tema } from './narrativa';

export type Eixo = 'familia' | 'ramo' | 'vertical';
export const EIXOS: Record<Eixo, string> = { familia: 'Família de TI', ramo: 'Ramo de TI', vertical: 'Vertical do cliente' };
export const SEM_GRUPO = 'Sem classificação';

/** temas que descrevem movimento da empresa; contexto fica fora da leitura de mercado */
export const TEMAS_MERCADO: Tema[] = ['lideranca', 'time', 'expansao', 'oferta', 'societario', 'negativo'];

export interface ContaMercado {
  id: string;
  nome: string;
  tier?: string;
  ramoTI?: { nome: string; familia: string };
  especializacao?: { nome: string };
}
export interface FatoMercado {
  id: string;
  contaId: string;
  tipo: string;
  categoria?: string | null;
  data: string;
  pontos?: number;
  sinal?: string;
  rotulo?: string;
  fonte?: string;
  url?: string;
}

export const grupoDaConta = (c: ContaMercado, eixo: Eixo) =>
  (eixo === 'familia' ? c.ramoTI?.familia : eixo === 'ramo' ? c.ramoTI?.nome : c.especializacao?.nome) || SEM_GRUPO;

const dia = (iso: string) => (iso ?? '').slice(0, 10);
const idade = (iso: string, hoje: string) => Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${dia(iso)}T00:00:00Z`)) / 86_400_000);
const vazio = (): Record<Tema, number> => ({ lideranca: 0, time: 0, expansao: 0, oferta: 0, societario: 0, negativo: 0, contexto: 0 });

export interface FatoNoGrupo<F extends FatoMercado = FatoMercado> {
  fato: F;
  conta: ContaMercado;
  tema: Tema;
}

export interface GrupoMercado<F extends FatoMercado = FatoMercado> {
  nome: string;
  /** contas do grupo na base */
  contas: number;
  /** contas do grupo com ao menos um fato de movimento na janela */
  contasComMovimento: number;
  porTema: Record<Tema, number>;
  /** fatos de movimento (sem contexto) na janela */
  fatos: FatoNoGrupo<F>[];
  /** tema com participação no grupo bem acima da base (índice ≥ 1,5 e ao menos 3 fatos) */
  destaque?: { tema: Tema; n: number; indice: number };
}

export interface Sequencia {
  /** "time→lideranca" */
  chave: string;
  temas: Tema[];
  contas: { id: string; nome: string; datas: string[] }[];
}

export interface LeituraMercado<F extends FatoMercado = FatoMercado> {
  eixo: Eixo;
  janelaDias: number;
  totalFatos: number;
  contasComMovimento: number;
  porTema: Record<Tema, number>;
  /** fatos por mês (AAAA-MM), do mais antigo ao mais recente */
  porMes: { mes: string; n: number }[];
  /** mais fatos primeiro; "Sem classificação" por último */
  grupos: GrupoMercado<F>[];
  sequencias: Sequencia[];
}

export interface OpcoesMercado {
  janelaDias?: number;
  /** ordem entre dois temas da mesma conta só conta se o segundo vier até tantos dias depois (padrão 180) */
  sequenciaDias?: number;
}

export function leituraMercado<F extends FatoMercado>(contas: ContaMercado[], fatos: F[], eixo: Eixo, hoje: string, opcoes: OpcoesMercado = {}): LeituraMercado<F> {
  const janela = opcoes.janelaDias ?? 90;
  const seqDias = opcoes.sequenciaDias ?? 180;
  const porId = new Map(contas.map(c => [c.id, c]));
  const contasPorGrupo = new Map<string, number>();
  for (const c of contas) contasPorGrupo.set(grupoDaConta(c, eixo), (contasPorGrupo.get(grupoDaConta(c, eixo)) ?? 0) + 1);

  const naJanela: FatoNoGrupo<F>[] = [];
  for (const f of fatos) {
    const conta = porId.get(f.contaId);
    if (!conta || !/^\d{4}-\d{2}-\d{2}/.test(f.data ?? '')) continue;
    const i = idade(f.data, hoje);
    if (i < 0 || i > janela) continue;
    const tema = temaDoFato(f);
    if (tema === 'contexto') continue;
    naJanela.push({ fato: f, conta, tema });
  }

  const porTema = vazio();
  const porMesMap = new Map<string, number>();
  const grupos = new Map<string, GrupoMercado<F>>();
  for (const x of naJanela) {
    porTema[x.tema]++;
    const mes = dia(x.fato.data).slice(0, 7);
    porMesMap.set(mes, (porMesMap.get(mes) ?? 0) + 1);
    const g = grupoDaConta(x.conta, eixo);
    if (!grupos.has(g)) grupos.set(g, { nome: g, contas: contasPorGrupo.get(g) ?? 0, contasComMovimento: 0, porTema: vazio(), fatos: [] });
    const gr = grupos.get(g)!;
    gr.porTema[x.tema]++;
    gr.fatos.push(x);
  }
  const total = naJanela.length;
  for (const g of grupos.values()) {
    g.contasComMovimento = new Set(g.fatos.map(x => x.conta.id)).size;
    g.fatos.sort((a, b) => dia(b.fato.data).localeCompare(dia(a.fato.data)) || (b.fato.pontos ?? 0) - (a.fato.pontos ?? 0));
    let melhor: GrupoMercado['destaque'];
    for (const t of TEMAS_MERCADO) {
      const n = g.porTema[t];
      if (n < 3 || !porTema[t]) continue;
      const indice = n / g.fatos.length / (porTema[t] / total);
      if (indice >= 1.5 && (!melhor || indice > melhor.indice)) melhor = { tema: t, n, indice: Math.round(indice * 10) / 10 };
    }
    g.destaque = melhor;
  }

  // sequências: em cada conta, a ordem em que os temas aparecem pela primeira vez (pares consecutivos)
  const porConta = new Map<string, FatoNoGrupo<F>[]>();
  for (const x of naJanela) porConta.set(x.conta.id, [...(porConta.get(x.conta.id) ?? []), x]);
  const seqs = new Map<string, Sequencia>();
  for (const lista of porConta.values()) {
    const primeiro = new Map<Tema, string>();
    for (const x of [...lista].sort((a, b) => dia(a.fato.data).localeCompare(dia(b.fato.data))))
      if (!primeiro.has(x.tema)) primeiro.set(x.tema, dia(x.fato.data));
    const ordem = [...primeiro.entries()];
    for (let i = 1; i < ordem.length; i++) {
      const [a, da] = ordem[i - 1];
      const [b, db] = ordem[i];
      if (da === db || idade(da, db) > seqDias) continue; // mesmo dia não define ordem; longe demais não é sequência
      const chave = `${a}→${b}`;
      if (!seqs.has(chave)) seqs.set(chave, { chave, temas: [a, b], contas: [] });
      seqs.get(chave)!.contas.push({ id: lista[0].conta.id, nome: lista[0].conta.nome, datas: [da, db] });
    }
  }

  return {
    eixo,
    janelaDias: janela,
    totalFatos: total,
    contasComMovimento: porConta.size,
    porTema,
    porMes: [...porMesMap.entries()].sort().map(([mes, n]) => ({ mes, n })),
    grupos: [...grupos.values()].sort((a, b) => Number(a.nome === SEM_GRUPO) - Number(b.nome === SEM_GRUPO) || b.fatos.length - a.fatos.length || a.nome.localeCompare(b.nome)),
    sequencias: [...seqs.values()].filter(s => s.contas.length >= 2).sort((a, b) => b.contas.length - a.contas.length || a.chave.localeCompare(b.chave)),
  };
}

export const rotuloSequencia = (s: Pick<Sequencia, 'temas'>) => s.temas.map(t => TEMAS[t].curto).join(' → ');
