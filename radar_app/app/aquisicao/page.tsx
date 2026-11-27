import { lerBase } from '@/lib/dados';
import { paraCasca } from '@/lib/casca-dados';
import dados from '@/data/aquisicao.json';
import { TelaMaturidade } from '@/components/aquisicao/maturidade';
import type { DadosAquisicao } from '@/lib/aquisicao-maturidade';

export const metadata = {
 title: 'Maturidade de aquisição',
 description: 'Atlas analítico de maturidade de aquisição com cinco níveis, foco L2/L3 e evidências auditáveis.',
};

export default async function Pagina(){
 const base=await lerBase();
 const atlas=(base as typeof base & { aquisicaoAtlas?: DadosAquisicao }).aquisicaoAtlas;
 const tiers=new Map(base.contas.map(c=>[c.id,c.tier]));
 const atual=atlas ? {...atlas,accounts:atlas.accounts.filter(c=>tiers.has(c.id)).map(c=>({...c,tier:tiers.get(c.id)??c.tier}))} : dados as unknown as DadosAquisicao;
 return <TelaMaturidade base={paraCasca(base)} dados={atual} />;
}
