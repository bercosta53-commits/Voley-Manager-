/**
 * Relacionamento da Velora com pessoas do comitê (escala 0–5, decisão de 26/11). Regras puras, usadas pela API e
 * pela tela; testes em scripts/tests/relacionamentos.test.mjs. A nota amplifica a nomeação de liderança na 3.3
 * (scripts/vscs/motor33.py) e marca a conta como "via quente" a partir de 4.
 */
export const ESCALA_RELACIONAMENTO: { nota: number; rotulo: string }[] = [
  { nota: 0, rotulo: 'Sem relação' },
  { nota: 1, rotulo: 'Conexão no LinkedIn ou conhecido de mercado' },
  { nota: 2, rotulo: 'Contato prévio' },
  { nota: 3, rotulo: 'Relação profissional' },
  { nota: 4, rotulo: 'Acesso direto' },
  { nota: 5, rotulo: 'Amigo profissional, com entrada' },
];
export const VIA_QUENTE = 4;
export const VALIDADE_RELACIONAMENTO_DIAS = 365;

export interface LinhaRelacionamento {
  conta_id: string;
  pessoa: string;
  nota: number;
  autor_email: string;
  registrado_em: string;
}

export interface RelacaoPessoa {
  /** maior nota válida entre os registros do time */
  nota: number;
  em: string;
  /** a nota que quem está vendo registrou, se registrou */
  minha: number | null;
  registros: number;
}

export const chavePessoa = (nome: string) =>
  nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function validarNota(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5 ? v : null;
}

/** Registros válidos (até 365 dias) agregados por pessoa: a maior nota, a data dela e a nota de quem vê. */
export function agregar(linhas: LinhaRelacionamento[], agora: Date, autor?: string | null): Record<string, RelacaoPessoa> {
  const out: Record<string, RelacaoPessoa> = {};
  for (const l of linhas) {
    const idade = (agora.getTime() - Date.parse(l.registrado_em)) / 86_400_000;
    if (!(idade <= VALIDADE_RELACIONAMENTO_DIAS) || validarNota(l.nota) === null) continue;
    const k = chavePessoa(l.pessoa);
    const atual = out[k] ?? { nota: -1, em: '', minha: null, registros: 0 };
    atual.registros += 1;
    if (l.nota > atual.nota || (l.nota === atual.nota && l.registrado_em > atual.em)) {
      atual.nota = l.nota;
      atual.em = l.registrado_em.slice(0, 10);
    }
    if (autor && l.autor_email === autor) atual.minha = l.nota;
    out[k] = atual;
  }
  return out;
}

/** Contas com via quente (alguém do comitê com nota ≥ 4), para o selo em Hoje. */
export function contasComViaQuente(linhas: LinhaRelacionamento[], agora: Date): string[] {
  const porConta = new Map<string, LinhaRelacionamento[]>();
  for (const l of linhas) porConta.set(l.conta_id, [...(porConta.get(l.conta_id) ?? []), l]);
  return [...porConta].filter(([, ls]) => Object.values(agregar(ls, agora)).some(r => r.nota >= VIA_QUENTE)).map(([id]) => id);
}
