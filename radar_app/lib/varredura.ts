/**
 * Cobertura da varredura: separa "sem fato" de "não varrido".
 *
 * Uma conta sem sinal pode ser uma conta em que nada aconteceu, ou uma conta que ninguém olhou. O snapshot passa
 * a trazer, para cada conta e fonte, a última varredura (`payload.varreduras`, contrato em
 * docs/varreduras.md). Um sinal também prova que a conta foi olhada na data do fato.
 *
 * Estados, do mais ao menos informativo:
 * - com_fato: há fato nos últimos `janelaFatoDias`;
 * - sem_fato: varrida nos últimos `validadeDias` e nada encontrado;
 * - vencida: já foi olhada (varredura ou fato), mas não recentemente;
 * - nao_varrida: nenhum registro de varredura nem fato.
 *
 * Sem dependências; testes em scripts/tests/varredura.test.mjs.
 */

export type ResultadoVarredura = 'com_fato' | 'sem_fato' | 'erro';

export interface Varredura {
  /** AAAA-MM-DD ou data e hora ISO */
  em: string;
  resultado: ResultadoVarredura;
  /** itens encontrados (antes da validação) */
  itens?: number;
  /** consulta usada, para reproduzir */
  consulta?: string;
}

/** contaId → fonteId → última varredura */
export type Varreduras = Record<string, Record<string, Varredura>>;

export type EstadoCobertura = 'com_fato' | 'sem_fato' | 'vencida' | 'nao_varrida';

export const ROTULO_COBERTURA: Record<EstadoCobertura, string> = {
  com_fato: 'Com fato recente',
  sem_fato: 'Varrida, sem fato',
  vencida: 'Sem leitura recente',
  nao_varrida: 'Sem leitura ainda',
};

export const EXPLICA_COBERTURA: Record<EstadoCobertura, string> = {
  com_fato: 'Há fato nos últimos 90 dias.',
  sem_fato: 'Foi olhada nos últimos 30 dias e nada foi encontrado. A ausência de sinal é informação.',
  vencida: 'Já foi olhada, mas não nos últimos 30 dias. A ausência de sinal não diz nada.',
  nao_varrida: 'Não há registro de varredura nem fato. A ausência de sinal não diz nada.',
};

export interface OpcoesCobertura {
  janelaFatoDias?: number;
  validadeDias?: number;
}

export interface CoberturaConta {
  estado: EstadoCobertura;
  /** data do fato mais recente (AAAA-MM-DD) */
  ultimoFato?: string;
  /** última varredura registrada (AAAA-MM-DD), de qualquer fonte */
  ultimaVarredura?: string;
  /** fonte da última varredura */
  fonte?: string;
  /** fontes com varredura válida (dentro da validade), sem erro */
  fontesValidas: string[];
}

const dia = (iso: string | undefined | null) => (iso ? String(iso).slice(0, 10) : '');
const idadeDias = (iso: string, hoje: string) => Math.floor((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);

export function coberturaDaConta(
  contaId: string,
  datasDosFatos: string[],
  varreduras: Varreduras | undefined,
  hoje: string,
  opcoes: OpcoesCobertura = {},
): CoberturaConta {
  const janela = opcoes.janelaFatoDias ?? 90;
  const validade = opcoes.validadeDias ?? 30;
  const ultimoFato = datasDosFatos.map(dia).filter(Boolean).sort().at(-1);
  const registros = Object.entries(varreduras?.[contaId] ?? {})
    .map(([fonte, v]) => ({ fonte, ...v, em: dia(v?.em) }))
    .filter(v => v.em && /^\d{4}-\d{2}-\d{2}$/.test(v.em));
  const ok = registros.filter(v => v.resultado !== 'erro');
  const ultima = [...ok].sort((a, b) => a.em.localeCompare(b.em)).at(-1);
  const fontesValidas = ok.filter(v => idadeDias(v.em, hoje) <= validade).map(v => v.fonte).sort();
  const base = { ultimoFato, ultimaVarredura: ultima?.em, fonte: ultima?.fonte, fontesValidas };
  if (ultimoFato && idadeDias(ultimoFato, hoje) <= janela) return { estado: 'com_fato', ...base };
  if (fontesValidas.length) return { estado: 'sem_fato', ...base };
  if (ultima || ultimoFato) return { estado: 'vencida', ...base };
  return { estado: 'nao_varrida', ...base };
}

export interface ContaComInformacao {
  id: string;
  nome: string;
  tier: string;
  /** data do fato mais recente */
  ultimoFato: string;
  /** título do fato mais recente */
  fato?: string;
  /** fatos nos últimos `janelaFatoDias` */
  fatos: number;
}

export interface ResumoCobertura {
  total: number;
  porEstado: Record<EstadoCobertura, number>;
  /** tier → estado → contas */
  porTier: Record<string, Record<EstadoCobertura, number>>;
  /** contas com fato recente, da notícia mais nova para a mais antiga */
  comInformacao: ContaComInformacao[];
  /** contas com fato recente pela idade do fato mais novo */
  frescor: { ate7: number; ate30: number; ate90: number };
  /** contas A/B que não dizem nada (vencida ou nunca varrida), as primeiras a varrer */
  aVarrer: { id: string; nome: string; tier: string; estado: EstadoCobertura; ultimaVarredura?: string; ultimoFato?: string }[];
}

const vazio = (): Record<EstadoCobertura, number> => ({ com_fato: 0, sem_fato: 0, vencida: 0, nao_varrida: 0 });

export function resumoCobertura(
  contas: { id: string; nome: string; tier?: string }[],
  sinais: { contaId: string; data: string; sinal?: string; rotulo?: string }[],
  varreduras: Varreduras | undefined,
  hoje: string,
  opcoes: OpcoesCobertura = {},
): ResumoCobertura {
  const janela = opcoes.janelaFatoDias ?? 90;
  const porConta = new Map<string, { data: string; sinal?: string; rotulo?: string }[]>();
  for (const s of sinais) porConta.set(s.contaId, [...(porConta.get(s.contaId) ?? []), s]);
  const porEstado = vazio();
  const porTier: ResumoCobertura['porTier'] = {};
  const aVarrer: ResumoCobertura['aVarrer'] = [];
  const comInformacao: ContaComInformacao[] = [];
  const frescor = { ate7: 0, ate30: 0, ate90: 0 };
  for (const c of contas) {
    const doConta = porConta.get(c.id) ?? [];
    const cb = coberturaDaConta(c.id, doConta.map(s => s.data), varreduras, hoje, opcoes);
    const tier = c.tier || '—';
    porEstado[cb.estado]++;
    (porTier[tier] ??= vazio())[cb.estado]++;
    if (cb.estado === 'com_fato' && cb.ultimoFato) {
      const idade = idadeDias(cb.ultimoFato, hoje);
      if (idade <= 7) frescor.ate7++;
      else if (idade <= 30) frescor.ate30++;
      else frescor.ate90++;
      const ultimo = doConta.find(s => dia(s.data) === cb.ultimoFato);
      comInformacao.push({
        id: c.id,
        nome: c.nome,
        tier,
        ultimoFato: cb.ultimoFato,
        fato: ultimo?.sinal ?? ultimo?.rotulo,
        fatos: doConta.filter(s => dia(s.data) && idadeDias(dia(s.data), hoje) <= janela).length,
      });
    }
    if ((tier === 'A' || tier === 'B') && (cb.estado === 'vencida' || cb.estado === 'nao_varrida'))
      aVarrer.push({ id: c.id, nome: c.nome, tier, estado: cb.estado, ultimaVarredura: cb.ultimaVarredura, ultimoFato: cb.ultimoFato });
  }
  comInformacao.sort((a, b) => b.ultimoFato.localeCompare(a.ultimoFato) || b.fatos - a.fatos || a.nome.localeCompare(b.nome));
  // nunca varridas primeiro; depois as mais antigas; A antes de B
  const peso = (x: (typeof aVarrer)[number]) => (x.estado === 'nao_varrida' ? 0 : 1);
  aVarrer.sort((a, b) => peso(a) - peso(b) || a.tier.localeCompare(b.tier) || (a.ultimaVarredura ?? a.ultimoFato ?? '').localeCompare(b.ultimaVarredura ?? b.ultimoFato ?? '') || a.nome.localeCompare(b.nome));
  return { total: contas.length, porEstado, porTier, comInformacao, frescor, aVarrer };
}
