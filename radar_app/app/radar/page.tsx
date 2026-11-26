import { lerBase } from '@/lib/dados';
import dados from '@/data/aquisicao.json';
import type { DadosAquisicao } from '@/lib/aquisicao-maturidade';
import { auditoriasPorDominio, linhasPrioridade } from '@/lib/prioridade-linhas';
import { TelaPrioridade } from '@/components/prioridade/tela';
import { paraCasca } from '@/lib/casca-dados';

export const metadata = { title: 'Prioridade de contas' };

/** Página principal do Radar: prioridade de contas em quatro eixos (modelo experimental, separado do VSCS). */
export default async function Pagina() {
  const base = await lerBase();
  const linhas = linhasPrioridade(base, auditoriasPorDominio(dados as unknown as DadosAquisicao), new Date());
  // S-1: a tela recebe as linhas prontas e só o índice leve da casca, não o snapshot inteiro
  return <TelaPrioridade base={paraCasca(base)} linhas={linhas} />;
}
