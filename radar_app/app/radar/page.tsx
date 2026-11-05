import { lerBase } from '@/lib/dados';
import { gerarBaseProximidade } from '@/lib/proximidade-sintetica';
import { TelaRadar } from '@/components/radar/radar';

export default async function Pagina() {
  const base = await lerBase();
  const proximidade = gerarBaseProximidade();
  return <TelaRadar base={base} proximidade={proximidade} />;
}
