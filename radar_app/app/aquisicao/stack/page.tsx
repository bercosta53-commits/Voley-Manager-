import { lerBase } from '@/lib/dados';
import dados from '@/data/aquisicao.json';
import { TelaAquisicao } from '@/components/aquisicao/aquisicao';

export const metadata={title:'Stack técnico | Velora Radar'};
export default async function Pagina(){
 const base=await lerBase();
 return <TelaAquisicao base={base} dados={dados as unknown as Parameters<typeof TelaAquisicao>[0]['dados']}/>;
}
