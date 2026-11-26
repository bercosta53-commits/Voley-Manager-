import { lerBase, lerRegrasIcp } from '@/lib/dados';
import { aliviarBase } from '@/lib/casca-dados';
import { TelaIcp } from '@/components/icp/icp';

export const metadata = { title: 'ICP' };

export default async function Pagina() {
  const [base, regras] = await Promise.all([lerBase(), lerRegrasIcp()]);
  // S-1: o ICP usa comitê, histórico e sinais; não usa série nem decomposição do score
  return <TelaIcp base={aliviarBase(base, { decomposicao: 'nenhuma', serie: false })} regras={regras} />;
}
