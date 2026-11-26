import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { lerBase } from '@/lib/dados';
import { paraCasca } from '@/lib/casca-dados';
import { TelaBriefing } from '@/components/conta/briefing';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const base = await lerBase();
  const nome = base.contas.find(c => c.id === id)?.nome;
  return { title: nome ? `Briefing: ${nome}` : 'Conta não encontrada' };
}

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await lerBase();
  const conta = base.contas.find(c => c.id === id);
  if (!conta) notFound();
  // como na Conta (S-1): só esta conta e os sinais dela, mais o índice leve da casca
  return <TelaBriefing base={{ ...paraCasca(base), conta, sinaisDaConta: base.sinais.filter(s => s.contaId === id) }} />;
}
