import { aliviarBase } from '@/lib/casca-dados';
import { lerBase, lerClima } from '@/lib/dados';
import { nivelVertical } from '@/lib/clima';
import { leituraPulso } from '@/lib/clima-pulso';
import { TelaClima } from '@/components/clima/clima';

export const metadata = { title: 'Clima' };

export default async function Pagina() {
  const [base, clima] = await Promise.all([lerBase(), lerClima()]);
  // pulso das empresas: calculado no servidor (lê o bloco OGI do snapshot), o navegador recebe só a leitura
  const pulso = leituraPulso(
    base as unknown as Parameters<typeof leituraPulso>[0],
    clima.verticais.map(v => ({ id: v.id, nome: v.nome, codigos: v.codigos, S: nivelVertical(clima, v).S })),
  );
  // S-1: o Clima usa contas, tier, VSCS e série; não usa histórico nem decomposição
  return <TelaClima base={aliviarBase(base, { decomposicao: 'nenhuma', historico: 'nenhum' })} dados={clima} pulso={pulso} />;
}
