import { lerBase } from '@/lib/dados';
import dados from '@/data/aquisicao.json';
import { TelaMaturidade } from '@/components/aquisicao/maturidade';
import type { DadosAquisicao } from '@/lib/aquisicao-maturidade';

export const metadata = {
 title: 'Maturidade de aquisição | Velora Radar',
 description: 'Atlas analítico de maturidade de aquisição com cinco níveis, foco L2/L3 e evidências auditáveis.',
};

export default async function Pagina(){
 const base=await lerBase();
 return <TelaMaturidade base={base} dados={dados as unknown as DadosAquisicao} />;
}
