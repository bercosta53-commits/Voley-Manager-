import type { Metadata } from 'next';
import { lerBase } from '@/lib/dados';
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
  if (!base.contas.some(c => c.id === id)) notFound();
  return <TelaConta base={base} contaId={id} />;
}
