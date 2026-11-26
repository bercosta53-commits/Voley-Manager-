import { lerBase } from '@/lib/dados';
import { gerarBaseProximidadeReal } from '@/lib/proximidade-real';
import { TelaRadar } from '@/components/radar/radar';

export const metadata = { title: 'Radar de proximidade' };

export default async function Pagina() {
  const base = await lerBase();
  const proximidade = gerarBaseProximidadeReal(base);
  return <TelaRadar base={base} proximidade={proximidade} />;
}
