/**
 * Narrativa da conta: os fatos agrupados em movimentos (tema + proximidade no tempo), com força, período e o que
 * mudou desde a última leitura. Só organiza fatos que existem: não infere causa, não inventa ligação e não muda o
 * score (o agrupamento causal da VSCS 3.3 continua em teste, em scripts/vscs/). Função pura; testes em
 * scripts/tests/narrativa.test.mjs.
 */

export type Tema = 'lideranca' | 'time' | 'expansao' | 'oferta' | 'societario' | 'negativo' | 'contexto';

export const TEMAS: Record<Tema, { titulo: string; curto: string }> = {
  lideranca: { titulo: 'Liderança mudando', curto: 'Liderança' },
  time: { titulo: 'Time comercial em formação', curto: 'Contratação' },
  expansao: { titulo: 'Expansão', curto: 'Expansão' },
  oferta: { titulo: 'Oferta nova', curto: 'Oferta' },
  societario: { titulo: 'Capital e sociedade', curto: 'Societário' },
  negativo: { titulo: 'Sinal de atenção', curto: 'Atenção' },
  contexto: { titulo: 'Presença e contexto', curto: 'Contexto' },
};

/** ordem de leitura quando dois movimentos terminam no mesmo dia; contexto sempre por último */
const ORDEM: Tema[] = ['lideranca', 'time', 'expansao', 'oferta', 'societario', 'negativo', 'contexto'];

export interface FatoNarrativa {
  id: string;
  tipo: string;
  categoria?: string | null;
  data: string;
  /** quando o Radar avisou; é o que conta para "novo desde a última leitura" */
  alertaEm?: string;
  pontos?: number;
  sinal?: string;
  rotulo?: string;
  porQueAgora?: string;
  fonte?: string;
  url?: string;
}

export interface Movimento<F extends FatoNarrativa = FatoNarrativa> {
  id: string;
  tema: Tema;
  titulo: string;
  de: string;
  ate: string;
  /** do mais recente ao mais antigo */
  fatos: F[];
  /** soma do que os fatos somam hoje ao score (pontos do motor em produção) */
  forca: number;
  /** fatos avisados depois da última leitura */
  novos: number;
}

export function temaDoFato(f: Pick<FatoNarrativa, 'tipo' | 'categoria'>): Tema {
  const t = f.tipo ?? '';
  if (f.categoria === 'negativo' || t === 'reestruturacao' || t === 'saida_executivo') return 'negativo';
  if (t === 'fusao_aquisicao' || t === 'captacao' || t === 'investimento') return 'societario';
  if (t.startsWith('vaga_') && t !== 'vaga_expansao_comercial') return 'time';
  if (t === 'executivo_chegou' || t.startsWith('troca_') || t === 'novo_cmo') return 'lideranca';
  if (t.startsWith('lancamento') || t === 'parceria') return 'oferta';
  if (t.startsWith('expansao') || t === 'nova_unidade' || t === 'resultados_crescimento' || t === 'vaga_expansao_comercial') return 'expansao';
  if (['evento', 'palestra_lideranca', 'premio', 'presenca_evento', 'noticia_setorial'].includes(t)) return 'contexto';
  const porCategoria: Record<string, Tema> = { lideranca: 'lideranca', contratacao: 'time', expansao: 'expansao', estrategia: 'oferta', gtm: 'oferta', intencao: 'expansao' };
  return porCategoria[f.categoria ?? ''] ?? 'contexto';
}

const dia = (iso: string | undefined) => (iso ?? '').slice(0, 10);
const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

export interface OpcoesNarrativa {
  /** fatos do mesmo tema com até tantos dias entre um e outro formam um movimento (padrão 120) */
  intervaloDias?: number;
  /** AAAA-MM-DD da última vez que esta pessoa leu a conta; sem ela, nada é marcado como novo */
  ultimaLeitura?: string;
}

export function movimentos<F extends FatoNarrativa>(fatos: F[], opcoes: OpcoesNarrativa = {}): Movimento<F>[] {
  const intervalo = opcoes.intervaloDias ?? 120;
  const porTema = new Map<Tema, F[]>();
  for (const f of fatos) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(f.data ?? '')) continue;
    const t = temaDoFato(f);
    porTema.set(t, [...(porTema.get(t) ?? []), f]);
  }
  const lista: Movimento<F>[] = [];
  for (const [tema, doTema] of porTema) {
    const asc = [...doTema].sort((a, b) => dia(a.data).localeCompare(dia(b.data)));
    let grupo: F[] = [];
    const fechar = () => {
      if (!grupo.length) return;
      const de = dia(grupo[0].data);
      const ate = dia(grupo.at(-1)!.data);
      const novos = opcoes.ultimaLeitura ? grupo.filter(f => dia(f.alertaEm || f.data) > opcoes.ultimaLeitura!).length : 0;
      lista.push({
        id: `${tema}-${de}`,
        tema,
        titulo: TEMAS[tema].titulo,
        de,
        ate,
        fatos: [...grupo].reverse(),
        forca: grupo.reduce((s, f) => s + (Number.isFinite(f.pontos) ? Number(f.pontos) : 0), 0),
        novos,
      });
      grupo = [];
    };
    for (const f of asc) {
      if (grupo.length && dias(dia(grupo.at(-1)!.data), dia(f.data)) > intervalo) fechar();
      grupo.push(f);
    }
    fechar();
  }
  // mais recente primeiro; empate: ordem de leitura dos temas; contexto sempre depois dos outros
  return lista.sort(
    (a, b) =>
      Number(a.tema === 'contexto') - Number(b.tema === 'contexto') || b.ate.localeCompare(a.ate) || ORDEM.indexOf(a.tema) - ORDEM.indexOf(b.tema),
  );
}

export interface ResumoNarrativa {
  /** frase curta, só com contagens e datas dos fatos */
  frase: string;
  /** movimento com mais força (fora o contexto), quando há algum que pontua */
  principal?: Movimento;
  novos: number;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const dataNarrativa = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
export const periodo = (m: Pick<Movimento, 'de' | 'ate'>) => (m.de === m.ate ? dataNarrativa(m.de) : `${dataNarrativa(m.de)} → ${dataNarrativa(m.ate)}`);
const fatosTxt = (n: number) => `${n} ${n === 1 ? 'fato' : 'fatos'}`;

export function resumoNarrativa(movs: Movimento[]): ResumoNarrativa {
  const novos = movs.reduce((s, m) => s + m.novos, 0);
  if (!movs.length) return { frase: 'Nenhum fato registrado nesta conta ainda.', novos };
  const fortes = movs.filter(m => m.tema !== 'contexto' && m.forca > 0).sort((a, b) => b.forca - a.forca);
  const principal = fortes[0];
  const semContexto = movs.filter(m => m.tema !== 'contexto');
  const contagem = semContexto.length
    ? `${semContexto.length} ${semContexto.length === 1 ? 'movimento' : 'movimentos'}`
    : 'Só fatos de contexto';
  const frase = principal
    ? `${contagem}. O que mais pesa: ${principal.titulo.toLowerCase()} (${fatosTxt(principal.fatos.length)}, ${periodo(principal)}).`
    : `${contagem}${semContexto.length ? ', nenhum somando ao score hoje' : ''}.`;
  return { frase, principal, novos };
}
