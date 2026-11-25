import { lerBase } from '@/lib/dados';
import { TelaDecisores } from '@/components/decisores/decisores';

export const metadata = { title: 'Decisores' };

export default async function Pagina() {
  const base = await lerBase();
  return <TelaDecisores base={base} />;
}
