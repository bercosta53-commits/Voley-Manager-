import { lerBase, lerClima } from '@/lib/dados';
import { TelaClima } from '@/components/clima/clima';

export default async function Pagina() {
  const [base, clima] = await Promise.all([lerBase(), lerClima()]);
  return <TelaClima base={base} dados={clima} />;
}
