import { lerBase } from '@/lib/dados';
import { TelaConta } from '@/components/conta/conta';

export async function generateStaticParams() {
  const base = await lerBase();
  return base.contas.map(c => ({ id: c.id }));
}

export const dynamicParams = false;

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await lerBase();
  return <TelaConta base={base} contaId={id} />;
}
