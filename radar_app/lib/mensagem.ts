import type { Conta, Sinal } from './tipos';

/** Rascunho curto da primeira mensagem. A pessoa revisa e envia; nada sai sozinho. */
export function rascunho(sinal: Sinal, conta: Conta) {
  const nome = sinal.abordar.nome.split(' ')[0];
  const abre = nome ? `Olá, ${nome}.` : 'Olá.';
  const fato = sinal.porQueAgora.charAt(0).toLowerCase() + sinal.porQueAgora.slice(1);
  const gancho: Record<string, string> = {
    vaga_marketing: 'Costuma ser o momento de desenhar metas e canais antes de a pessoa chegar.',
    vaga_comercial: 'Time comercial crescendo pede previsibilidade de pipeline desde o primeiro mês.',
    troca_diretoria: 'Nova gestão costuma revisar prioridades de crescimento nos primeiros 90 dias.',
    novo_cmo: 'Os primeiros 90 dias de uma nova liderança de marketing definem o plano do ano.',
    fusao: 'Integrar marcas e bases depois de uma fusão abre espaço para rever o funil.',
    socio_entrou: 'Mudança no quadro societário costuma trazer novas metas de crescimento.',
    anuncios: 'Mídia paga rende mais quando a operação comercial está pronta para o volume.',
    nova_unidade: 'Expansão regional pede um plano de aquisição por praça.',
    lancamento: 'Lançamento B2B ganha tração quando marketing e vendas miram as mesmas contas.',
  };
  return `${abre} Vi que a ${conta.nome} ${fato}. ${gancho[sinal.tipo] ?? ''} Faz sentido uma conversa de 20 minutos para trocar ideias sobre isso?`.replace(/\s+/g, ' ').trim();
}
