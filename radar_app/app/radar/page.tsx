import { lerBase } from '@/lib/dados';
import { gerarBaseProximidadeReal } from '@/lib/proximidade-real';
import { TelaRadar } from '@/components/radar/radar';

export default async function Pagina() {
  const base = await lerBase();
  const proximidade = gerarBaseProximidadeReal(base);
  return <TelaRadar base={base} proximidade={proximidade} />;
}
