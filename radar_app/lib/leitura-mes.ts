/**
 * Leitura do mês na página de sinais: o que aconteceu nos últimos 30 dias da carga, comparado com os 30 dias
 * anteriores. Soma só fatos registrados (sem exemplo, sem notícia setorial, sem contexto) e devolve os fatos
 * que sustentam cada número. Função pura; testes em scripts/tests/leitura-mes.test.mjs.
 */
import { temaDoFato, TEMAS, type Tema } from './narrativa';
import { TEMAS_MERCADO, SEM_GRUPO, type ContaMercado } from './mercado';

export interface FatoMes {
  id: string;
  contaId: string;
  tipo: string;
  categoria?: string | null;
  data: string;
  pontos?: number;
  sinal?: string;
  rotulo?: string;
  exemplo?: boolean;
}

export interface ContaMes extends ContaMercado {
  score?: number;
}

export interface Variacao {
  agora: number;
  antes: number;
}

export interface TemaNoMes extends Variacao {
  tema: Tema;
}

export interface GrupoNoMes extends Variacao {
  nome: string;
  contas: number;
}

export interface MovimentoPrincipal<F extends FatoMes = FatoMes> {
  fato: F;
  conta: ContaMes;
  tema: Tema;
  /** outros fatos da mesma conta na janela (o principal não entra) */
  outros: number;
}

export interface LeituraMes<F extends FatoMes = FatoMes> {
  /** AAAA-MM-DD: fim da janela (data da carga) */
  ate: string;
  /** AAAA-MM-DD: início da janela */
  desde: string;
  janelaDias: number;
  fatos: Variacao;
  contas: Variacao;
  /** contas Tier A ou B com movimento na janela */
  contasAB: number;
  /** temas de movimento, do que mais cresceu ao que mais caiu; sem os zerados nos dois períodos */
  temas: TemaNoMes[];
  /** famílias de TI com fatos na janela, mais fatos primeiro ("Sem classificação" por último) */
  familias: GrupoNoMes[];
  /** fatos de maior peso, um por conta, Tier A/B primeiro */
  principais: MovimentoPrincipal<F>[];
  /** fatos por semana, as 12 semanas até a carga (a última é a mais recente) */
  semanas: { ate: string; n: number }[];
}

const dia = (iso: string) => (iso ?? '').slice(0, 10);
const idade = (iso: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${dia(iso)}T00:00:00Z`)) / 86_400_000);
const somar = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const tierAB = (c: ContaMes) => c.tier === 'A' || c.tier === 'B';

export function leituraDoMes<F extends FatoMes>(contas: ContaMes[], fatos: F[], ate: string, opcoes: { janelaDias?: number; principais?: number } = {}): LeituraMes<F> {
  const janela = opcoes.janelaDias ?? 30;
  const porId = new Map(contas.map(c => [c.id, c]));
  const atual: { fato: F; conta: ContaMes; tema: Tema }[] = [];
  const anterior: { fato: F; conta: ContaMes; tema: Tema }[] = [];
  const semanas = Array.from({ length: 12 }, (_, i) => ({ ate: somar(ate, -7 * (11 - i)), n: 0 }));

  for (const f of fatos) {
    if (f.exemplo || f.tipo === 'noticia_setorial' || !/^\d{4}-\d{2}-\d{2}/.test(f.data ?? '')) continue;
    const conta = porId.get(f.contaId);
    if (!conta) continue;
    const tema = temaDoFato(f);
    if (tema === 'contexto') continue;
    const i = idade(f.data, ate);
    if (i < 0) continue;
    if (i < 84) semanas[11 - Math.floor(i / 7)]!.n++;
    if (i < janela) atual.push({ fato: f, conta, tema });
    else if (i < 2 * janela) anterior.push({ fato: f, conta, tema });
  }

  const contaTema = (l: typeof atual, t: Tema) => l.filter(x => x.tema === t).length;
  const temas = TEMAS_MERCADO.map(t => ({ tema: t, agora: contaTema(atual, t), antes: contaTema(anterior, t) }))
    .filter(t => t.agora + t.antes > 0)
    .sort((a, b) => b.agora - b.antes - (a.agora - a.antes) || b.agora - a.agora);

  const familia = (c: ContaMes) => c.ramoTI?.familia || SEM_GRUPO;
  const contasPorFamilia = new Map<string, number>();
  for (const c of contas) contasPorFamilia.set(familia(c), (contasPorFamilia.get(familia(c)) ?? 0) + 1);
  const fam = new Map<string, GrupoNoMes>();
  const grupo = (nome: string) => fam.get(nome) ?? fam.set(nome, { nome, contas: contasPorFamilia.get(nome) ?? 0, agora: 0, antes: 0 }).get(nome)!;
  for (const x of atual) grupo(familia(x.conta)).agora++;
  for (const x of anterior) if (fam.has(familia(x.conta))) grupo(familia(x.conta)).antes++;
  const familias = [...fam.values()].sort((a, b) => Number(a.nome === SEM_GRUPO) - Number(b.nome === SEM_GRUPO) || b.agora - a.agora || a.nome.localeCompare(b.nome));

  // um fato por conta: o de maior peso (empate: o mais recente); contas A/B primeiro
  const porConta = new Map<string, typeof atual>();
  for (const x of atual) porConta.set(x.conta.id, [...(porConta.get(x.conta.id) ?? []), x]);
  const candidatos = [...porConta.values()]
    .map(l => {
      const [p] = [...l].sort((a, b) => (b.fato.pontos ?? 0) - (a.fato.pontos ?? 0) || dia(b.fato.data).localeCompare(dia(a.fato.data)));
      return { ...p!, outros: l.length - 1 };
    })
    .sort((a, b) => Number(tierAB(b.conta)) - Number(tierAB(a.conta)) || (b.fato.pontos ?? 0) - (a.fato.pontos ?? 0) || b.outros - a.outros || dia(b.fato.data).localeCompare(dia(a.fato.data)));
  // variedade: primeiro o melhor de cada tema, depois completa pela ordem de peso
  const limite = opcoes.principais ?? 5;
  const principais: MovimentoPrincipal<F>[] = [];
  const vistos = new Set<Tema>();
  for (const c of candidatos) if (principais.length < limite && !vistos.has(c.tema)) (vistos.add(c.tema), principais.push(c));
  for (const c of candidatos) if (principais.length < limite && !principais.includes(c)) principais.push(c);
  principais.sort((a, b) => candidatos.indexOf(a) - candidatos.indexOf(b));

  return {
    ate,
    desde: somar(ate, -(janela - 1)),
    janelaDias: janela,
    fatos: { agora: atual.length, antes: anterior.length },
    contas: { agora: porConta.size, antes: new Set(anterior.map(x => x.conta.id)).size },
    contasAB: [...porConta.values()].filter(l => tierAB(l[0]!.conta)).length,
    temas,
    familias,
    principais,
    semanas,
  };
}

/** variação em % (arredondada); null quando o período anterior é zero */
export const variacaoPct = (v: Variacao) => (v.antes > 0 ? Math.round(((v.agora - v.antes) / v.antes) * 100) : null);

/**
 * A frase que amarra a leitura, só com números calculados: volume e variação, o tema que mais cresceu e onde o
 * movimento se concentra. Sem fatos na janela, diz isso e não inventa tendência.
 */
export function fraseDoMes(l: LeituraMes): string {
  if (!l.fatos.agora) return `Nenhum fato de movimento nos ${l.janelaDias} dias até a última carga.`;
  const pct = variacaoPct(l.fatos);
  const partes = [
    `${l.fatos.agora} ${l.fatos.agora === 1 ? 'fato' : 'fatos'} em ${l.contas.agora} ${l.contas.agora === 1 ? 'conta' : 'contas'}` +
      (pct === null ? '' : pct === 0 ? ', o mesmo volume do mês anterior' : `, ${pct > 0 ? '+' : ''}${pct}% sobre o mês anterior`),
  ];
  const sobe = l.temas.find(t => t.agora > t.antes);
  if (sobe) partes.push(`${TEMAS[sobe.tema].curto} puxa o crescimento (${sobe.antes} → ${sobe.agora})`);
  const top = l.familias.find(f => f.nome !== SEM_GRUPO && f.agora > 0);
  if (top && l.fatos.agora >= 4) partes.push(`${top.nome} concentra ${Math.round((top.agora / l.fatos.agora) * 100)}% dos fatos`);
  return partes.join('. ') + '.';
}
