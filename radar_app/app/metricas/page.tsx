import { lerBase } from '@/lib/dados';
import { TelaMetricas } from '@/components/metricas/metricas';

export default async function Pagina() {
  const base = await lerBase();
  return <TelaMetricas base={base} />;
}
