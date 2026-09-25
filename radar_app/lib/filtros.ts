import type { Conta, Sinal } from './tipos';
import { FAMILIAS, STATUS, familia, normalizar, sentido, status, type Familia, type Sentido, type Status } from './contas';

export interface Filtros {
  texto: string;
  familias: Familia[];
  tiers: string[];
  status: Status[];
  tendencia: Sentido | '';
  ufs: string[];
  comSinal: boolean;
  semContato: boolean;
  scoreMin: number;
}

export const SEM_FILTRO: Filtros = { texto: '', familias: [], tiers: [], status: [], tendencia: '', ufs: [], comSinal: false, semContato: false, scoreMin: 0 };

export function aplicar(contas: Conta[], filtros: Filtros, sinaisPorConta: Map<string, Sinal[]>) {
  const texto = normalizar(filtros.texto.trim());
  return contas.filter(c => {
    if (texto) {
      const alvo = normalizar([c.nome, c.razaoSocial, c.cnpj, c.cnpj.replace(/\D/g, ''), c.dominio, c.cidade, c.segmento, ...c.comite.map(p => p.nome)].join(' '));
      if (!texto.split(/\s+/).every(p => alvo.includes(p))) return false;
    }
    if (filtros.familias.length && !filtros.familias.includes(familia(c))) return false;
    if (filtros.tiers.length && !filtros.tiers.includes(c.tier)) return false;
    if (filtros.status.length && !filtros.status.includes(status(c))) return false;
    if (filtros.tendencia && sentido(c.tendencia) !== filtros.tendencia) return false;
    if (filtros.ufs.length && !filtros.ufs.includes(c.uf)) return false;
    if (filtros.comSinal && !sinaisPorConta.get(c.id)?.length) return false;
    if (filtros.semContato && c.comite.length) return false;
    if (filtros.scoreMin && c.score < filtros.scoreMin) return false;
    return true;
  });
}

export const temFiltro = (f: Filtros) => JSON.stringify(f) !== JSON.stringify(SEM_FILTRO);

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const ESTADOS: Record<string, string> = {
  'santa catarina': 'SC', 'rio grande do sul': 'RS', 'parana': 'PR', 'sao paulo': 'SP', 'rio de janeiro': 'RJ', 'minas gerais': 'MG',
  'minas': 'MG', 'bahia': 'BA', 'goias': 'GO', 'distrito federal': 'DF', 'espirito santo': 'ES', 'pernambuco': 'PE', 'ceara': 'CE',
  'mato grosso do sul': 'MS', 'mato grosso': 'MT',
};
const PALAVRAS_FAMILIA: [RegExp, Familia][] = [
  [/cooperativ|coop\b|central/, 'cooperativa'],
  [/consorci/, 'consorcio'],
  [/segur|previd/, 'seguro'],
  [/banco|bancos|credito/, 'banco'],
  [/fintech|tecnolog|pagamento|saas/, 'tecnologia'],
];

/**
 * Pergunta em linguagem natural → filtros. Não é IA: reconhece palavras (tier, estado, segmento, esquentando,
 * status, "com sinal", "sem contato", "score acima de") e devolve também o que entendeu, para a pessoa conferir.
 */
export function interpretar(pergunta: string): { filtros: Filtros; entendido: string[]; resto: string } {
  let q = ` ${normalizar(pergunta)} `;
  const f: Filtros = { ...SEM_FILTRO, familias: [], tiers: [], status: [], ufs: [] };
  const entendido: string[] = [];
  const tirar = (re: RegExp) => (q = q.replace(re, ' '));

  const tier = q.match(/\btier\s*([abc])\b/);
  if (tier) {
    f.tiers.push(tier[1]!.toUpperCase());
    entendido.push(`tier ${tier[1]!.toUpperCase()}`);
    tirar(/\btier\s*[abc]\b/);
  }
  for (const [nome, uf] of Object.entries(ESTADOS))
    if (q.includes(` ${nome} `) && !f.ufs.includes(uf)) {
      f.ufs.push(uf);
      tirar(new RegExp(`\\b${nome}\\b`));
    }
  for (const uf of UFS) {
    const re = new RegExp(`\\b(em|no|na|do|da|de)?\\s*${uf.toLowerCase()}\\b`);
    // "sp", "sc"… só como estado quando vier depois de em/no/na ou isolado no fim.
    if (new RegExp(`\\b(em|no|na)\\s+${uf.toLowerCase()}\\b`).test(q) || new RegExp(`\\s${uf.toLowerCase()}\\s*$`).test(q)) {
      if (!f.ufs.includes(uf)) f.ufs.push(uf);
      tirar(re);
    }
  }
  if (f.ufs.length) entendido.push(`em ${f.ufs.join(', ')}`);
  for (const [re, fam] of PALAVRAS_FAMILIA)
    if (re.test(q) && !f.familias.includes(fam)) {
      f.familias.push(fam);
      entendido.push(FAMILIAS.find(x => x.id === fam)!.rotulo.toLowerCase());
      tirar(new RegExp(re.source, 'g'));
    }
  if (/esquent|subindo|aquec|\bquentes?\b/.test(q)) (f.tendencia = 'sobe'), entendido.push('esquentando'), tirar(/\S*(esquent|subindo|aquec)\S*|\bquentes?\b/g);
  else if (/esfri|caindo|\bfrias?\b/.test(q)) (f.tendencia = 'desce'), entendido.push('esfriando'), tirar(/\S*(esfri|caindo)\S*|\bfrias?\b/g);
  if (/nao abord|insuficiente/.test(q)) f.status.push('nao_abordar'), tirar(/nao abordar|insuficiente/g);
  else if (/\bativar\b|prontas? para abord/.test(q)) f.status.push('ativar'), tirar(/\bativar\b|prontas? para abordagem/g);
  if (/\bnutrir\b/.test(q)) f.status.push('nutrir'), tirar(/\bnutrir\b/g);
  if (f.status.length) entendido.push(`status ${f.status.map(s => STATUS.find(x => x.id === s)!.rotulo.toLowerCase()).join(' ou ')}`);
  if (/com sina|sinal novo|sinais novos|tem sina|teve sina|movimenta/.test(q)) (f.comSinal = true), entendido.push('com sinal na caixa'), tirar(/com sina\S*|sina\S* novo\S*|tem sina\S*|teve sina\S*|movimenta\S*/g);
  if (/sem (contato|decisor|pessoa|nome)/.test(q)) (f.semContato = true), entendido.push('sem ninguém do comitê identificado'), tirar(/sem (contato|decisor|pessoa|nome)\S*/g);
  const min = q.match(/score\s*(acima de|maior que|>=?|de pelo menos|minimo)?\s*(\d{1,3})/);
  if (min) (f.scoreMin = Number(min[2])), entendido.push(`score ${f.scoreMin} ou mais`), tirar(/score\s*(acima de|maior que|>=?|de pelo menos|minimo)?\s*\d{1,3}/);

  const resto = q
    .replace(/\b(quais|qual|que|as|os|a|o|contas?|empresas?|estao|esta|sao|com|de|do|da|dos|das|em|no|na|me|mostre|mostra|liste|lista|ver|tem|e|ou|por|para|mais|todas?)\b/g, ' ')
    .replace(/[?.,!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { filtros: f, entendido, resto };
}

/** Filtros → URL da tela Contas (?filtros=…), para Cmd+K e para compartilhar. */
export const paraUrl = (f: Filtros) => `/contas?f=${encodeURIComponent(JSON.stringify(f))}`;

export function daUrl(busca: string): Filtros | null {
  try {
    const f = new URLSearchParams(busca).get('f');
    return f ? { ...SEM_FILTRO, ...JSON.parse(f) } : null;
  } catch {
    return null;
  }
}
