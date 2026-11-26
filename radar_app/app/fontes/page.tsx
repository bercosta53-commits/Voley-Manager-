import { lerBase } from '@/lib/dados';
import { paraCasca } from '@/lib/casca-dados';
import { resumoCobertura } from '@/lib/varredura';
import { TelaFontes } from '@/components/fontes/fontes';

export const metadata = { title: 'Fontes' };

export default async function Pagina() {
  const base = await lerBase();
  // S-1: Fontes só usa as fontes e a data da carga, que já estão no índice leve da casca; a cobertura vai resumida
  const cobertura = resumoCobertura(base.contas, base.sinais, base.varreduras, base.geradoEm.slice(0, 10));
  return <TelaFontes base={paraCasca(base)} cobertura={cobertura} />;
}
