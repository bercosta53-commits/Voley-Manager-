import { lerBase } from '@/lib/dados';
import { paraCasca } from '@/lib/casca-dados';
import { TelaMovimentos } from '@/components/movimentos/movimentos';

export const metadata = { title: 'Movimentos' };

export default async function Pagina() {
  const base = await lerBase();
  // S-1: só o que a leitura de mercado usa: grupo de cada conta e os fatos (sem histórico nem decomposição)
  const contas = base.contas.map(c => ({ id: c.id, nome: c.nome, tier: c.tier, ramoTI: c.ramoTI && { nome: c.ramoTI.nome, familia: c.ramoTI.familia }, especializacao: c.especializacao && { nome: c.especializacao.nome } }));
  const fatos = base.sinais.map(s => ({ id: s.id, contaId: s.contaId, tipo: s.tipo, categoria: s.categoria, data: s.data, pontos: s.pontos, sinal: s.sinal ?? s.rotulo, fonte: s.fonte, url: s.url }));
  return <TelaMovimentos base={paraCasca(base)} contas={contas} fatos={fatos} hoje={base.geradoEm.slice(0, 10)} />;
}
