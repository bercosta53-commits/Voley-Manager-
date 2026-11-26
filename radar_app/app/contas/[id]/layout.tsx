import { notFound } from 'next/navigation';
import { lerBase } from '@/lib/dados';

/**
 * A existência da conta é decidida aqui, no layout, antes do loading.tsx desta rota (que só envolve a página).
 * Como nenhuma seção acima tem loading, a resposta ainda não começou: conta inexistente devolve 404 de verdade,
 * não uma página "não encontrada" com status 200. lerBase é memorizada por requisição: a página não lê de novo.
 */
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = await lerBase();
  if (!base.contas.some(c => c.id === id)) notFound();
  return children;
}
