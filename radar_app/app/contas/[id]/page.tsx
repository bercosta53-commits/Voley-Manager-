import { lerBase } from '@/lib/dados';
import { notFound } from 'next/navigation';
import { TelaConta } from '@/components/conta/conta';

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await lerBase();
  if (!base.contas.some(c => c.id === id)) notFound();
  return <TelaConta base={base} contaId={id} />;
}
