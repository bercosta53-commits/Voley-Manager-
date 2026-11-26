import type { Metadata } from 'next';
import { lerBase } from '@/lib/dados';
import { paraCasca } from '@/lib/casca-dados';
import { notFound } from 'next/navigation';
import { TelaConta } from '@/components/conta/conta';

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
  // S-1: só esta conta e os sinais dela, mais o índice leve da casca (menu, Cmd+K, frescor)
  return <TelaConta base={{ ...paraCasca(base), conta, sinaisDaConta: base.sinais.filter(s => s.contaId === id) }} contaId={id} />;
}
