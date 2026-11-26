import type { Conta, Sinal } from './tipos';

/**
 * Por que o fato abre conversa para a Velora, por tipo de sinal. É a leitura comercial do sinal: vai no
 * rascunho da mensagem e na linha "Oportunidade" da tese da conta. Revisado com a inteligência em 25/11
 * (parceria nova; executivo_chegou, fusao_aquisicao, captacao e lancamento_ia sem prometer a dor).
 */
const GANCHOS: Record<string, string> = {
  vaga_marketing: 'Costuma ser o momento de desenhar metas e canais antes de a pessoa chegar.',
  vaga_comercial: 'Time comercial crescendo pede previsibilidade de pipeline desde o primeiro mês.',
  troca_diretoria: 'Nova gestão costuma revisar prioridades de crescimento nos primeiros 90 dias.',
  novo_cmo: 'Os primeiros 90 dias de uma nova liderança de marketing definem o plano do ano.',
  fusao: 'Integrar marcas e bases depois de uma fusão abre espaço para rever o funil.',
  socio_entrou: 'Mudança no quadro societário costuma trazer novas metas de crescimento.',
  anuncios: 'Mídia paga rende mais quando a operação comercial está pronta para o volume.',
  nova_unidade: 'Expansão regional pede um plano de aquisição por praça.',
  lancamento: 'Lançamento B2B ganha tração quando marketing e vendas miram as mesmas contas.',
  // tipos dos coletores reais
  vaga_area_alvo: 'Time comercial crescendo pede previsibilidade de pipeline desde o primeiro mês.',
  vaga_expansao_comercial: 'Contratar várias pessoas de uma vez pede pipeline pronto para elas desde o primeiro mês.',
  vaga_lideranca_alvo: 'Quem chega para liderar costuma revisar canais e metas nos primeiros 90 dias.',
  executivo_chegou: 'A chegada de um executivo pode abrir uma janela de revisão de estratégia e prioridades.',
  fusao_aquisicao: 'Uma operação societária pode mudar prioridades, autonomia comercial e necessidades de integração.',
  captacao: 'Uma captação pode criar condições para discutir a eficiência dos investimentos em crescimento.',
  lancamento_produto: 'Lançamento B2B ganha tração quando marketing e vendas miram as mesmas contas.',
  lancamento_servico: 'Lançamento B2B ganha tração quando marketing e vendas miram as mesmas contas.',
  lancamento_ia: 'Uma solução de IA pode exigir clareza de posicionamento, diferenciação e adoção comercial.',
  expansao_mercado: 'Expansão regional pede um plano de aquisição por praça.',
  parceria: 'Uma nova parceria pode abrir canais comerciais e exigir alinhamento de posicionamento e geração de demanda.',
};

/** A leitura comercial de um tipo de sinal, ou undefined quando ainda não há uma escrita para ele. */
export const gancho = (tipo: string): string | undefined => GANCHOS[tipo];

/** Rascunho curto da primeira mensagem. A pessoa revisa e envia; nada sai sozinho. */
export function rascunho(sinal: Sinal, conta: Conta) {
  const nome = sinal.abordar.nome.split(' ')[0];
  const abre = nome ? `Olá, ${nome}.` : 'Olá.';
  const fato = (sinal.porQueAgora.charAt(0).toLowerCase() + sinal.porQueAgora.slice(1)).replace(/\.+$/, '');
  // "Contratou…", "Abriu…", "Está…" encaixam em "Vi que a X…"; frases sem verbo ("Vaga de…") entram depois de dois-pontos.
  const comVerbo = /^(\S+(ou|iu|eu)|está|passou|contratando|concluiu)(?=\s)/i.test(sinal.porQueAgora);
  const visto = comVerbo ? `Vi que a ${conta.nome} ${fato}.` : `Vi um movimento na ${conta.nome}: ${fato}.`;
  return `${abre} ${visto} ${gancho(sinal.tipo) ?? ''} Faz sentido uma conversa de 20 minutos para trocar ideias sobre isso?`.replace(/\s+/g, ' ').trim();
}
