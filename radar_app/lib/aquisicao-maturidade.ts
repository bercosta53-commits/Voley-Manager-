import {avaliarCrm, type ProvaCRM, type AvaliacaoCRM} from './crm-profundidade';

/** Velora Acquisition Maturity Atlas.
 * Classificação do footprint PÚBLICO, não certificação de maturidade de negócio.
 * Ausência em um crawl nunca demonstra ausência operacional.
 */
export type EstadoTecnico = 'network'|'html'|'request'|'not_observed'|'not_tested';
export type NivelMaturidade = 0|1|2|3|4|5;
export type Confianca = 'adequada'|'parcial'|'insuficiente';

export interface ContaAquisicao {
 id:string;name:string;domain:string;tier:string;audit:string;validPages:number;forms:number;whatsappLinks:number;
 tags:Record<string,EstadoTecnico>;priority:number;signalFamilies:number;crmHistorical:string;crmObserved:string;mediaObserved:string;
 ctaStage:string;ctaConclusion:string;ctaClicked:boolean;ctaHttp:string;cmpVisible:boolean;consent:string;
 nextValidation:string;evidence:string;historicalSource:string;limitations:string;observation:string;
 sourceCohort?:string;historicalTech?:string[];sector?:string;specialization?:string;region?:string;
 verifiedICP?:boolean;verifiedRevenue?:boolean;readiness?:string;lastScannedAt?:string;
 crmOperacional?:ProvaCRM;
 // Apenas auditorias com acesso autorizado podem preencher este objeto.
 evidenciaOperacional?:{
  crmPipelineRevenue:boolean;sourceAttribution:boolean;governance:boolean;
  experimentation:boolean;incrementality:boolean;forecasting:boolean;
  verifiedAt:string;reviewer:string;sourceUrl:string;
 };
}
export interface DadosAquisicao {
 schema:string;lastUpdated:string;source:string;caveat:string;accounts:ContaAquisicao[];
}
export interface Dimensoes {
 medicao:number;midia:number;captacao:number;orquestracao:number;eventos:number|null;
}
export interface AnaliseAquisicao {
 conta:ContaAquisicao;nivel:NivelMaturidade;confianca:Confianca;
 dimensoes:Dimensoes;familias:number;indicios:string[];
 hipotese:string;proximoTeste:string;indiceObservavel:number;
 x:number;y:number;foco:boolean;
 potencialL4:boolean;potencialL4ComEvento:boolean;
 maturidadeConfirmada:boolean;qualidadeEvidencia:number;
 atratividadeVelora:number;requisitosPendentes:string[];
 caracterizacaoNivel:string;
 crm:AvaliacaoCRM;
}
export const NIVEIS = [
 {nivel:1,curto:'L1',titulo:'Presença inicial',sub:'Sinais pontuais',descricao:'Site e pontos de contato, com pouca instrumentação observável. Requer descoberta, não diagnóstico de ausência.',cor:'#88929c'},
 {nivel:2,curto:'L2',titulo:'Aquisição emergente',sub:'Canais em funcionamento',descricao:'Mensuração e captação ou mídia com sinais concretos, mas sem comprovação pública de operação integrada.',cor:'#be8758'},
 {nivel:3,curto:'L3',titulo:'Operação estruturada',sub:'Aquisição multicanal',descricao:'Várias capacidades de instrumentação, ativação ou automação observáveis. Não comprova integração entre Marketing e Vendas.',cor:'#596b58'},
 {nivel:4,curto:'L4',titulo:'Integrada por dados',sub:'Integração verificada',descricao:'Somente após validação autorizada de CRM, pipeline, atribuição e governança. Sem essa validação, exibe-se potencial L4.',cor:'#697997'},
 {nivel:5,curto:'L5',titulo:'Otimização contínua',sub:'Crescimento experimental',descricao:'Requer evidências de experimentação, incrementabilidade e otimização orientada a resultados.',cor:'#635d81'}
] as const;

export const NOMES_TECNOLOGIAS:Record<string,string>={
 gtm:'Google Tag Manager',ga4:'GA4',googleAds:'Google Ads',meta:'Meta Pixel',linkedin:'LinkedIn Insight',
 rdStation:'RD Station',hubspot:'HubSpot',ploomes:'Ploomes',mautic:'Mautic',salesforce:'Salesforce',
 pipedrive:'Pipedrive',bitrix:'Bitrix24',activeCampaign:'ActiveCampaign',whatsapp:'WhatsApp',
 contactForm7:'Contact Form 7',typeform:'Typeform',googleForms:'Google Forms'
};
export const GRUPO_CRM=['rdStation','hubspot','ploomes','mautic','salesforce','pipedrive','bitrix','activeCampaign'];
export const GRUPO_MIDIA=['googleAds','meta','linkedin'];
export const GRUPO_TRACKING=['gtm','ga4'];
const entre=(n:number,a=0,b=100)=>Math.min(b,Math.max(a,n));
export const presente=(c:ContaAquisicao,chave:string)=>c.tags[chave]==='network';
export const quantidade=(c:ContaAquisicao,chaves:string[])=>chaves.filter(k=>presente(c,k)).length;
function eventoObservavel(c:ContaAquisicao):number|null {
 const t=(c.ctaConclusion||'').toUpperCase();
 if(t.includes('COMERCIAL_RESPOSTA_HTTP'))return 100;
 if(t.includes('COMERCIAL_REQUEST')||t.includes('INDICIO_COMERCIAL'))return 65;
 if(t.includes('DATALAYER_EVENTO_COMERCIAL')||t.includes('DATALAYER_COM_EVENTO_NOMEADO'))return 48;
 if(t.includes('NETWORK_ESPECIFICA'))return 35;
 if(t.includes('APENAS_NETWORK')||t.includes('REQUISICOES_GENERICAS')||t.includes('APENAS_DATALAYER')||t.includes('DATALAYER_GENERICO'))return 18;
 if(t.includes('SEM_EVENTO_OBSERVADO'))return 0;
 return null;
}
function provaOperacional(c:ContaAquisicao):boolean{
 const e=c.evidenciaOperacional;
 if(!e)return false;
 const provenance=Boolean(e.verifiedAt&&e.reviewer&&/^https:\/\//.test(e.sourceUrl));
 return provenance&&e.crmPipelineRevenue===true&&e.sourceAttribution===true&&e.governance===true;
}
function provaOtimizacao(c:ContaAquisicao):boolean{
 const e=c.evidenciaOperacional;
 return provaOperacional(c)&&Boolean(e&&e.experimentation===true&&e.incrementality===true&&e.forecasting===true);
}
export function analisarConta(c:ContaAquisicao):AnaliseAquisicao {
 const tracking=quantidade(c,GRUPO_TRACKING);
 const media=quantidade(c,GRUPO_MIDIA);
 const crm=quantidade(c,GRUPO_CRM);
 const avaliacaoCRM=avaliarCrm(c);
 const formas=Number(c.forms>0)+Number(c.whatsappLinks>0);
 const crmForte=avaliacaoCRM.confirmado&&avaliacaoCRM.score>=80;
 const eventos=eventoObservavel(c);
 const dimensoes:Dimensoes={
  medicao:tracking*50,midia:media===0?0:media===1?38:media===2?70:100,
  captacao:formas*50,orquestracao:avaliacaoCRM.score,eventos
 };
 const familias=Number(tracking>0)+Number(media>0)+Number(formas>0)+Number(crm>0||crmForte);
 // A avaliação pública observa capacidades, não mede sucesso operacional.
 // L3 pode existir sem script de CRM no front-end: B2B consultivo usa CRM server-side.
 const estruturada=(tracking>0&&media>0&&crm>0&&formas>0) ||
  (tracking>0&&media>=2&&formas>0) ||
  (tracking>0&&media>0&&crm>0&&eventos!==null&&eventos>=65) ||
  (media>=2&&crm>0&&formas>0) ||
  (avaliacaoCRM.confirmado&&avaliacaoCRM.score>=80&&tracking>0&&formas>0);
 let nivel:NivelMaturidade=0;
 if(c.validPages>0&&familias>0){
  nivel=estruturada?3:familias>=2?2:1;
 }
 // L4 e L5 são acessíveis: apenas mediante fontes operacionais verificadas.
 if(provaOperacional(c))nivel=4;
 if(provaOtimizacao(c))nivel=5;

 // Identificar a hipótese L4 separadamente evita confundir stack complexo com integração de receita.
 const potencialL4=tracking===2&&media>=2&&(crm>=1||crmForte)&&formas>=1&&nivel===3;
 const potencialL4ComEvento=potencialL4&&eventos!==null&&eventos>=65;
 const sinais=tracking+media+crm+Number(crmForte&&crm===0);
 const confianca:Confianca=c.validPages===0||familias===0?'insuficiente':
   c.validPages>=2&&sinais>=2?'adequada':'parcial';
 // Confiança de cobertura: número de páginas e de evidências distintas, não é certeza do nível.
 const qualidadeEvidencia=provaOperacional(c)?100:c.validPages===0?0:
  entre(Math.round(12+Math.min(c.validPages,3)*13+Math.min(familias,4)*9+
   Math.min(sinais,5)*4+(eventos!==null?10:0)),0,85);
 const indicios:string[]=[];
 if(tracking)indicios.push(tracking+' tecnologia'+(tracking>1?'s':'')+' de mensuração');
 if(media)indicios.push(media+' plataforma'+(media>1?'s':'')+' de mídia');
 if(avaliacaoCRM.score)indicios.push(avaliacaoCRM.fornecedor+': '+(avaliacaoCRM.confirmado?'CRM comercial verificado':'script web identificado; CRM não verificado'));
 if(crm>1)indicios.push(crm+' tecnologias de CRM/automação web detectadas');
 if(formas)indicios.push(formas===2?'Formulário + WhatsApp':'Canal de conversão no site');
 if(eventos!==null)indicios.push(eventos>=65?'Evento comercial específico observado':'CTA testado; envio não certificado');

 const hipotese=potencialL4?'Verificar se o stack multicanal já conecta aquisição, CRM, pipeline e receita':
  nivel>=4?'Avaliar lacunas de eficiência, incrementabilidade e otimização baseada em receita':
  nivel===3?'Investigar atribuição e gestão de leads entre canais de aquisição e comercial':
  nivel===2?(crm>0?'Validar uso da automação e sua integração com vendas':
   media>0?'Verificar qualidade dos eventos e evolução dos leads até a venda':'Avaliar ativação de canais e instrumentação'):
  nivel===1?'Descobrir a operação de aquisição antes de inferir maturidade':
  'Dados públicos insuficientes para estimar o estágio';
 const proximoTeste=potencialL4?
  'Solicitar evidências de CRM, pipeline, UTM e atribuição à receita; sem acesso, manter L3':
  nivel>=4?'Revisar indicadores de incrementabilidade e governança com responsável autorizado':
  eventos!==null&&eventos>=65?'Validar recebimento do evento em Ads/analytics e vínculo com oportunidades no CRM':
  nivel===3?'Validar UTMs, eventos de conversão, origem no CRM e qualificação de leads':
  nivel===2?'Auditar formulário/WhatsApp e passagem dos leads ao comercial':
  'Validar domínio, campanhas e canais em uma auditoria autorizada';
 const requisitosPendentes:string[]=[];
 if(!provaOperacional(c)){
  requisitosPendentes.push('CRM e pipeline conectados à receita (evidência interna)');
  requisitosPendentes.push('Atribuição de origem e governança comercial validadas');
 }
 if(!provaOtimizacao(c))requisitosPendentes.push('Experimentação, incrementabilidade e previsão verificadas');
 if(c.verifiedICP===false)requisitosPendentes.push('ICP, faturamento e decisores ainda não validados');

 const fit=c.tier==='A'?18:c.tier==='B'?11:5;
 const sinaisPositivos=Math.min(16,familias*4);
 const cobertura=confianca==='adequada'?12:confianca==='parcial'?6:0;
 const momento=Math.min(12,Math.max(0,c.priority)*.12);
 const zona=nivel===2?14:nivel===3?12:nivel===4?6:0;
 // CRM enterprise em uso validado vale até 25 pontos; simples script RD Station vale ~5.
 // HubSpot web e Salesforce web têm peso relevante, mas não se confundem com CRM instalado.
 const pesoCRM=Math.round(avaliacaoCRM.score*.26);
 const penalidade=c.verifiedICP===false?12:0;
 const atratividadeVelora=entre(Math.round(fit+sinaisPositivos+cobertura+momento+zona+pesoCRM-penalidade));
 const indiceObservavel=Math.round((dimensoes.medicao*.28+dimensoes.midia*.23+dimensoes.captacao*.20+
   dimensoes.orquestracao*.24+(eventos===null?0:eventos)*.05)/(eventos===null?0.95:1));
 const x=entre(dimensoes.medicao*.78+(eventos===null?0:eventos)*.22);
 const y=entre(dimensoes.midia*.43+dimensoes.orquestracao*.37+dimensoes.captacao*.20);
 const caracterizacaoNivel=nivel>=4?'Nível com evidências operacionais verificadas':
  nivel===0?'Não classificável pelas páginas auditadas':'Estimativa de maturidade observável; não certificação operacional';
 return {
  conta:c,nivel,confianca,dimensoes,familias,indicios,hipotese,proximoTeste,indiceObservavel,x,y,
  foco:(nivel===2||nivel===3)&&confianca!=='insuficiente',
  potencialL4,potencialL4ComEvento,maturidadeConfirmada:nivel>=4,
  qualidadeEvidencia,atratividadeVelora,requisitosPendentes,caracterizacaoNivel,crm:avaliacaoCRM
 };
}
export function analisarBase(contas:ContaAquisicao[]):AnaliseAquisicao[]{return contas.map(analisarConta)}
export function contagemNiveis(analises:AnaliseAquisicao[]):Record<NivelMaturidade,number>{
 const result:Record<NivelMaturidade,number>={0:0,1:0,2:0,3:0,4:0,5:0};
 for(const a of analises)result[a.nivel]++;
 return result;
}
/** Prioridade comercial e maturidade são dimensões separadas. */
export function pontuacaoFoco(a:AnaliseAquisicao):number{return a.atratividadeVelora;}
