import type { Metadata } from 'next';
import { lerBase } from '@/lib/dados';
import { paraCasca } from '@/lib/casca-dados';
import { notFound } from 'next/navigation';
import { TelaConta } from '@/components/conta/conta';
import dadosAquisicao from '@/data/aquisicao.json';
import dadosClima from '@/data/clima.json';
import type { DadosClima } from '@/lib/clima';
import type { DadosAquisicao } from '@/lib/aquisicao-maturidade';
import { auditoriasPorDominio, fonteAquisicao, climaPorCodigo, climaNaPrioridade, linhasPrioridade } from '@/lib/prioridade-linhas';

// lerBase é memorizada por requisição (React cache): o título e a página fazem uma só leitura.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const base = await lerBase();
  return { title: base.contas.find(c => c.id === id)?.nome ?? 'Conta não encontrada' };
}

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await lerBase();
  const conta = base.contas.find(c => c.id === id);
  if (!conta) notFound();
  // radar da conta: as quatro dimensões (ICP, sinais, clima do setor, oportunidade digital) calculadas como no Radar
  const [linhaRadar] = linhasPrioridade({ ...base, contas: [conta] }, auditoriasPorDominio(fonteAquisicao(base, dadosAquisicao as unknown as DadosAquisicao)), new Date(), climaPorCodigo(dadosClima as unknown as DadosClima), climaNaPrioridade(base, dadosClima as unknown as DadosClima));
  // S-1: só esta conta e os sinais dela, mais o índice leve da casca (menu, Cmd+K, frescor)
  return <TelaConta base={{ ...paraCasca(base), conta, sinaisDaConta: base.sinais.filter(s => s.contaId === id), varreduraDaConta: base.varreduras?.[id], linhaRadar }} contaId={id} />;
}
