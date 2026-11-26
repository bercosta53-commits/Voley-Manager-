import { lerBase } from '@/lib/dados';
import { paraCasca } from '@/lib/casca-dados';
import { TelaFontes } from '@/components/fontes/fontes';

export const metadata = { title: 'Fontes' };

export default async function Pagina() {
  const base = await lerBase();
  // S-1: Fontes só usa as fontes e a data da carga, que já estão no índice leve da casca
  return <TelaFontes base={paraCasca(base)} />;
}
