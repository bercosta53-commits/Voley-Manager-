import { ListaEsqueleto } from '@/components/hoje/estados';

/** Esqueleto de carregamento, usado pelo loading.tsx de cada seção (não há loading na raiz: ver app/contas/[id]/layout.tsx). */
export function Carregando() {
  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pt-20 md:px-6 md:pt-24">
      <ListaEsqueleto />
    </main>
  );
}
