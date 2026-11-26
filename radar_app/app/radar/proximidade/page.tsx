import { aliviarBase } from '@/lib/casca-dados';
import { lerBase } from '@/lib/dados';
import { gerarBaseProximidadeReal } from '@/lib/proximidade-real';
import { TelaRadar } from '@/components/radar/radar';

export const metadata = { title: 'Radar de proximidade' };

export default async function Pagina() {
  const base = await lerBase();
  const proximidade = gerarBaseProximidadeReal(base);
  // S-1: o anel já vem calculado no servidor; a tela usa série e sinais, não histórico nem decomposição
  return <TelaRadar base={aliviarBase(base, { decomposicao: 'nenhuma', historico: 'nenhum' })} proximidade={proximidade} />;
}
