import { aliviarBase } from '@/lib/casca-dados';
import { lerBase } from '@/lib/dados';
import { TelaContas } from '@/components/contas/contas';

export const metadata = { title: 'Contas' };

export default async function Pagina() {
  const base = await lerBase();
  // S-1: a lista usa a série (mini-curva) e só o fato mais recente do histórico
  return <TelaContas base={aliviarBase(base, { decomposicao: 'nenhuma', historico: 'mais_recente' })} />;
}
