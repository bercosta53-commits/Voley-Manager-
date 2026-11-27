import { lerBase } from '@/lib/dados';
import { paraCasca } from '@/lib/casca-dados';
import dados from '@/data/aquisicao.json';
import { TelaAquisicao } from '@/components/aquisicao/aquisicao';

export const metadata={title:'Stack técnico'};
export default async function Pagina(){
 const base=await lerBase();
 const atlas=(base as typeof base & { aquisicaoAtlas?: Parameters<typeof TelaAquisicao>[0]['dados'] }).aquisicaoAtlas;
 const tiers=new Map(base.contas.map(c=>[c.id,c.tier]));
 const atual=atlas ? {...atlas,accounts:atlas.accounts.filter(c=>tiers.has(c.id)).map(c=>({...c,tier:tiers.get(c.id)??c.tier}))} : dados as unknown as Parameters<typeof TelaAquisicao>[0]['dados'];
 return <TelaAquisicao base={paraCasca(base)} dados={atual}/>;
}
