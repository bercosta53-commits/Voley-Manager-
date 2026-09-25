import { lerBase } from '@/lib/dados';
import { TelaContas } from '@/components/contas/contas';

export default async function Pagina() {
  const base = await lerBase();
  return <TelaContas base={base} />;
}
