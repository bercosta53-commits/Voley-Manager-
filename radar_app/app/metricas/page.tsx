import { lerBase } from '@/lib/dados';
import { aliviarBase } from '@/lib/casca-dados';
import { exemploMetodologia } from '@/lib/exemplo-metodologia';
import { TelaMetricas } from '@/components/metricas/metricas';

export const metadata = { title: 'Métricas' };

export default async function Pagina() {
  const base = await lerBase();
  // S-1: Métricas lê sinais, score e comitê; a decomposição do VSCS só vai para a conta do exemplo da metodologia
  const exemplo = exemploMetodologia(base.contas);
  return <TelaMetricas base={aliviarBase(base, { decomposicao: 'nenhuma', historico: 'nenhum', serie: false, manter: exemplo ? [exemplo.id] : [] })} />;
}
