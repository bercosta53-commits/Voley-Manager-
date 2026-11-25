import { lerBase, lerClima } from '@/lib/dados';
import { TelaClima } from '@/components/clima/clima';
import { ClimaEditorial } from '@/components/clima/clima-editorial';

export default async function Pagina() {
  const [base, clima] = await Promise.all([lerBase(), lerClima()]);
  if (clima.edicao) {
    return <ClimaEditorial base={base} edicao={clima.edicao} contexto={[...clima.indicadores, ...(clima.politicaBolsa ?? [])]} />;
  }
  return <TelaClima base={base} dados={clima} />;
}
