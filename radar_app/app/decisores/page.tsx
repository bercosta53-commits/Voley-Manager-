import { aliviarBase } from '@/lib/casca-dados';
import { lerBase } from '@/lib/dados';
import { TelaDecisores } from '@/components/decisores/decisores';

export const metadata = { title: 'Decisores' };

export default async function Pagina() {
  const base = await lerBase();
  // S-1: Decisores lê o comitê; não usa série, histórico nem decomposição do score
  return <TelaDecisores base={aliviarBase(base, { decomposicao: 'nenhuma', historico: 'nenhum', serie: false })} />;
}
