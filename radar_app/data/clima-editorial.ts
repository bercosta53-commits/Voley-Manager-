import type { EdicaoClima } from '../lib/clima';

const fontes = {
  copom: { nome: 'BCB · Ata do Copom', url: 'https://www.bcb.gov.br/publicacoes/atascopom/04112026' },
  focus: { nome: 'BCB · Focus de 19/11', url: 'https://www.bcb.gov.br/content/focus/focus/R20261119.pdf' },
  credito: { nome: 'BCB · Crédito de setembro', url: 'https://www.bcb.gov.br/content/estatisticas/hist_estatisticasmonetariascredito/202610_Texto_de_estatisticas_monetarias_e_de_credito.pdf' },
  condicoesCredito: { nome: 'BCB · Pesquisa de Condições de Crédito', url: 'https://www.bcb.gov.br/content/publicacoes/ptc/202609/RelatorioPTC-Setembro2026.pdf' },
  calendarioBCB: { nome: 'BCB · Calendário estatístico', url: 'https://www.bcb.gov.br/estatisticas/notas_calendario' },
  agendaCopom: { nome: 'BCB · Calendário do Copom', url: 'https://www.bcb.gov.br/acessoinformacao/calendariobc?agenda=Reuni%C3%B5es+do+Copom' },
  simples: { nome: 'Receita Federal · Resolução CGSN nº 196', url: 'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/novembro/comite-gestor-do-simples-nacional-publica-novas-regras-para-o-simples-nacional-e-para-a-transicao-da-reforma-tributaria/' },
  fiscal: { nome: 'Receita Federal · Cronograma fiscal', url: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/reforma-tributaria-do-consumo/orientacoes-da-reforma-tributaria/cronograma' },
  cni: { nome: 'CNI · Sondagem Industrial', url: 'https://static.portaldaindustria.com.br/media/filer_public/24/fe/24fe3e47-dc12-4b0b-8a4b-142559def6ee/sondagemindustrial_outubro2026.pdf' },
  ans: { nome: 'ANS · Beneficiários de setembro', url: 'https://www.gov.br/ans/pt-br/assuntos/noticias/numeros-do-setor/ans-divulga-numeros-de-beneficiarios-de-setembro/' },
  susep: { nome: 'Susep · Boletim de setembro', url: 'https://www.gov.br/susep/pt-br/central-de-conteudos/noticias/2026/novembro/setor-supervisionado-pela-susep-registra-r-315-21-bilhoes-em-receitas-ate-setembro' },
  vc: { nome: 'KPMG · Venture Pulse do 3º tri', url: 'https://kpmg.com/br/pt/insights/2026/11/venture-pulse-q3-2026.html' },
};

export const climaEditorial: EdicaoClima = {
  data: '2026-11-25',
  resumo: 'O Focus passou a projetar menos crescimento e juros mais altos para 2027 do que quatro semanas antes. A janela mais direta para a Velora é a adequação à CBS e ao IBS, desde que haja carteira exposta e prazo confirmado. Em crédito, investigue recuperação de carteira antes de propor aquisição. Na indústria, concentre a prospecção em perdas mensuráveis e projetos já aprovados.',
  macro: [
    { rotulo: 'Selic vigente', valor: '13,75%', referencia: 'Taxa anual mantida em 04/11', fonte: fontes.copom },
    { rotulo: 'Selic no fim de 2027', valor: '13,00%', referencia: 'Mediana Focus · 11,75% quatro semanas antes', fonte: fontes.focus },
    { rotulo: 'PIB de 2027', valor: '+1,00%', referencia: 'Mediana Focus · +1,31% quatro semanas antes', fonte: fontes.focus },
    { rotulo: 'IPCA de 2027', valor: '5,12%', referencia: 'Mediana Focus · 4,34% quatro semanas antes', fonte: fontes.focus },
  ],
  teses: [
    {
      id: 'reforma-fiscal', titulo: 'Adequação fiscal com prazo definido', recorte: 'Regtech, ERP fiscal e serviços tributários', prioridade: 'abordar',
      fatos: [
        { texto: 'A Resolução CGSN nº 196 ajusta o Simples à transição da CBS e do IBS, com mudanças em apuração, declaração e repartição de tributos.', fonte: fontes.simples },
        { texto: 'O calendário oficial distingue obrigações por documento e regime. Para o Simples, há hipóteses com início em 1º de janeiro e outras em 1º de março de 2027.', fonte: fontes.fiscal },
      ],
      leitura: 'Fornecedores de ERP fiscal e escritórios com carteira empresarial podem ter demanda de adequação em lotes. A oportunidade para a Velora é estruturar a geração de demanda e a ativação da base por recorte fiscal.',
      gatilho: 'Fornecedor com carteira exposta, calendário de implantação, leiaute aplicável e responsável fiscal ou de produto identificado.',
      oferta: 'Propor um plano de segmentos, jornada e CRM para converter clientes elegíveis em diagnósticos. Medir taxa de adesão por carteira e reuniões qualificadas.',
      limite: 'A data aplicável depende de operação, documento e regime. Confirme o enquadramento com a área fiscal da conta.',
    },
    {
      id: 'gestao-de-carteira', titulo: 'Cobrança e renegociação de carteira PJ', recorte: 'Fintech, cooperativas, crédito e tecnologia de cobrança', prioridade: 'validar',
      fatos: [
        { texto: 'Em setembro, a inadimplência da carteira PJ total ficou em 3,3% e a do crédito livre PJ em 4,2%. Ambas recuaram 0,1 p.p. no mês e subiram, respectivamente, 0,5 e 0,6 p.p. em 12 meses.', fonte: fontes.credito },
        { texto: 'Na pesquisa trimestral do BCB, a oferta para grandes empresas seguiu restritiva no 3º trimestre. Os respondentes esperavam intensificação das restrições no 4º trimestre.', fonte: fontes.condicoesCredito },
      ],
      leitura: 'A piora anual sustenta investigar recuperação de carteira. O recuo mensal pede confirmação antes de tratar o problema como urgente. A tese é mais aderente a quem administra carteiras ou vende cobrança do que a um originador à procura de volume.',
      gatilho: 'Conta com volume vencido, meta de recuperação e um responsável pela cobrança que consiga abrir dados por faixa de atraso e canal.',
      oferta: 'Testar uma jornada de renegociação em uma faixa de atraso. Acompanhar recuperação líquida por real vencido, custo por acordo e acordos mantidos.',
      limite: 'As taxas são agregadas do sistema. A decisão depende da composição e do desempenho da carteira da conta.',
    },
    {
      id: 'produtividade-industrial', titulo: 'Produtividade industrial com retorno demonstrável', recorte: 'Indústria 4.0, automação e fornecedores industriais', prioridade: 'validar',
      fatos: [
        { texto: 'A intenção de investimento caiu de 52,6 para 50,0 pontos em novembro, menor nível desde julho de 2020. A escala da sondagem vai de 0 a 100 pontos.', fonte: fontes.cni },
        { texto: 'A utilização da capacidade instalada ficou em 70% em outubro, estável em relação a setembro e abaixo da média de 71% para o mês.', fonte: fontes.cni },
      ],
      leitura: 'O ambiente favorece propostas que resolvem uma perda atual. Projetos amplos de expansão ou transformação precisam de evidência de verba e patrocínio em cada planta.',
      gatilho: 'Parada recorrente, desperdício, conta de energia relevante, projeto aprovado ou contratação ligada à planta.',
      oferta: 'Estruturar com o fornecedor uma prospecção por planta e gargalo. Ancorar o piloto em horas de parada, refugo ou consumo por unidade produzida.',
      limite: 'A sondagem mede a intenção declarada da indústria. Confirme o investimento aprovado e a linha de base do processo.',
    },
    {
      id: 'planos-empresariais', titulo: 'Aquisição e retenção em planos empresariais', recorte: 'Operadoras, corretoras de saúde e fornecedores de benefícios', prioridade: 'validar',
      fatos: [
        { texto: 'Em setembro, a base dos planos médicos coletivos empresariais cresceu 0,15% no mês e 1,92% em 12 meses. No comparativo anual, os individuais recuaram 2,99% e os coletivos por adesão caíram 0,65%.', fonte: fontes.ans },
      ],
      leitura: 'Há crescimento na base empresarial, com espaço para investigar captação, conversão de cotações e retenção. O potencial comercial depende do produto, da praça e do canal da operadora.',
      gatilho: 'Operadora ou corretora que ampliou a oferta PME, abriu canal regional ou tem meta comercial com taxa de conversão conhecida.',
      oferta: 'Auditar a jornada entre cotação, proposta e adesão. Priorizar uma praça e medir conversão, custo por vida ativa e permanência.',
      limite: 'As vidas informadas pela ANS medem cobertura contratada. Verifique margem, cancelamentos e orçamento no segmento da conta.',
    },
    {
      id: 'seguros-de-vida-e-auto', titulo: 'Distribuição de seguros de vida e auto', recorte: 'Seguradoras, insurtechs e corretoras com carteira nesses ramos', prioridade: 'monitorar',
      fatos: [
        { texto: 'Até setembro, os seguros de vida e auto cresceram, em termos reais, 3,08% e 1,83%, respectivamente. As receitas do conjunto supervisionado cresceram 0,68% em termos nominais.', fonte: fontes.susep },
      ],
      leitura: 'Os ramos sustentam uma busca dirigida por mudanças de distribuição e integração. A leitura do setor agregado é mais fraca e oferece pouco fundamento para abordar toda a vertical.',
      gatilho: 'Lançamento de produto, abertura de canal de corretores ou mudança pública na operação de cotação.',
      oferta: 'Se houver gatilho, propor diagnóstico de ativação do canal. Medir corretores produtivos e conversão de cotação em apólice por ramo.',
      limite: 'O crescimento de prêmios agrega diferentes empresas, produtos e canais. Valide captura de demanda e orçamento na conta.',
    },
    {
      id: 'financiamento-de-tecnologia', titulo: 'Captação de tecnologia ainda seletiva', recorte: 'Software B2B e empresas dependentes de capital de risco', prioridade: 'monitorar',
      fatos: [
        { texto: 'O Brasil captou US$ 609,4 milhões no 3º trimestre, alta de 56,1% sobre o trimestre anterior e queda de 46,8% sobre o mesmo trimestre de 2025. No acumulado até setembro, o volume caiu 45,1% em um ano.', fonte: fontes.vc },
      ],
      leitura: 'A melhora trimestral justifica revisitar empresas com rodada confirmada, lançamento ou contratação de liderança. O comparativo anual recomenda seletividade em propostas de expansão de aquisição.',
      gatilho: 'Rodada confirmada e uso dos recursos ligado a crescimento, ou operação com receita recorrente e verba comercial comprovada.',
      oferta: 'Validar economia unitária e orçamento antes de propor escala. Começar pelo gargalo de conversão ou pelo canal com melhor retorno comprovado.',
      limite: 'Volume financeiro de rodadas pode concentrar-se em poucos negócios. A captação agregada diz pouco sobre o caixa de uma empresa específica.',
    },
  ],
  agenda: [
    { data: '2026-11-27', titulo: 'Crédito de outubro', leitura: 'Atualizar a leitura de inadimplência PJ e verificar se a queda mensal de setembro se sustentou.', fonte: fontes.calendarioBCB },
    { data: '2026-12-01', titulo: 'Prazo fiscal para operações específicas', leitura: 'Confirmar o documento e o enquadramento antes de usar o prazo como motivo de abordagem.', fonte: fontes.fiscal },
    { data: '2026-12-09', titulo: 'Decisão do Copom', leitura: 'Rever hipóteses sobre custo de capital e prazo de retorno após a decisão e o comunicado.', fonte: fontes.agendaCopom },
    { data: '2027-01-01', titulo: 'Etapa da transição de CBS e IBS', leitura: 'Validar carteira, escopo da obrigação e calendário de implantação com o fornecedor.', fonte: fontes.fiscal },
  ],
};
