import { lerBase, lerRegrasIcp } from '@/lib/dados';
import { TelaIcp } from '@/components/icp/icp';

export default async function Pagina() {
  const [base, regras] = await Promise.all([lerBase(), lerRegrasIcp()]);
  return <TelaIcp base={base} regras={regras} />;
}
