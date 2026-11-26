import { lerBase } from '@/lib/dados';
import { paraCasca } from '@/lib/casca-dados';
import dados from '@/data/aquisicao.json';
import { TelaAquisicao } from '@/components/aquisicao/aquisicao';

export const metadata={title:'Stack técnico'};
export default async function Pagina(){
 const base=await lerBase();
 return <TelaAquisicao base={paraCasca(base)} dados={dados as unknown as Parameters<typeof TelaAquisicao>[0]['dados']}/>;
}
