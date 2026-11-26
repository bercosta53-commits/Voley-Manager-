import { aliviarBase } from '@/lib/casca-dados';
import { lerBase, lerClima } from '@/lib/dados';
import { TelaClima } from '@/components/clima/clima';

export const metadata = { title: 'Clima' };

export default async function Pagina() {
  const [base, clima] = await Promise.all([lerBase(), lerClima()]);
  // S-1: o Clima usa contas, tier, VSCS e série; não usa histórico nem decomposição
  return <TelaClima base={aliviarBase(base, { decomposicao: 'nenhuma', historico: 'nenhum' })} dados={clima} />;
}
