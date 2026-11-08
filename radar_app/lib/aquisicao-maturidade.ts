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
}
export const NIVEIS = [
 {nivel:1,curto:'L1',titulo:'Presença inicial',sub:'Sinais pontuais',descricao:'Site e pontos de contato, com pouca instrumentação observável. Requer descoberta, não diagnóstico de ausência.',cor:'#88929c'},
 {nivel:2,curto:'L2',titulo:'Aquisição emergente',sub:'Canais em funcionamento',descricao:'Mensuração e captação ou mídia com sinais concretos, mas sem comprovação pública de operação integrada.',cor:'#be8758'},
 {nivel:3,curto:'L3',titulo:'Operação estruturada',sub:'Stack em consolidação',descricao:'Mensuração, mídia e tecnologia comercial no ambiente web. Oportunidade de validar integração e eficiência.',cor:'#596b58'},
 {nivel:4,curto:'L4',titulo:'Integrada por dados',sub:'Receita conectada',descricao:'Requer comprovação interna de CRM, atribuição e governança de ponta a ponta.',cor:'#697997'},
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
export function analisarConta(c:ContaAquisicao):AnaliseAquisicao {
 const tracking=quantidade(c,GRUPO_TRACKING);
 const media=quantidade(c,GRUPO_MIDIA);
 const crm=quantidade(c,GRUPO_CRM);
 const formas=Number(c.forms>0)+Number(c.whatsappLinks>0);
 const eventos=eventoObservavel(c);
 const dimensoes:Dimensoes={medicao:tracking*50,midia:media===0?0:media===1?38:media===2?70:100,
   captacao:formas*50,orquestracao:crm===0?0:crm===1?70:100,eventos};
 const familias=Number(tracking>0)+Number(media>0)+Number(formas>0)+Number(crm>0);
 // L4/L5 só podem ser reconhecidos mediante validação de atribuição e operação internas.
 // Na base pública atual, níveis 1–3 são footprints prováveis; 0 = inconclusivo.
 let nivel:NivelMaturidade=0;
 if(c.validPages>0&&familias>0){
  if(tracking>0&&media>0&&crm>0&&formas>0)nivel=3;
  else if((tracking>0&&(media>0||crm>0||formas>0))||(media>0&&(crm>0||formas>0)))nivel=2;
  else nivel=1;
 }
 const evidencias=tracking+media+crm;
 const confianca:Confianca=c.validPages===0||familias===0?'insuficiente':c.validPages>=2&&evidencias>=2?'adequada':'parcial';
 const indicios:string[]=[];
 if(tracking)indicios.push(tracking+' tecnologia'+(tracking>1?'s':'')+' de mensuração');
 if(media)indicios.push(media+' plataforma'+(media>1?'s':'')+' de mídia');
 if(crm)indicios.push(crm+' assinatura'+(crm>1?'s':'')+' de CRM web');
 if(formas)indicios.push(formas===2?'Formulário + WhatsApp':'Canal de conversão no site');
 if(eventos!==null)indicios.push(eventos>=65?'Evento comercial observado':'CTA testado; envio não certificado');
 const hipotese=nivel===3?'Validar atribuição de ponta a ponta, gestão de leads e eficiência do stack comercial':
   nivel===2?(crm>0?'Verificar ligação entre automação, mídia e oportunidades comerciais':
     media>0?'Investigar rastreamento de conversões e passagem para vendas':'Avaliar evolução de instrumentação e ativação de aquisição'):
   nivel===1?'Investigar canais, mídia e operação comercial antes de inferir maturidade':
   'Dados públicos insuficientes para classificar esta operação';
 const proximoTeste=eventos!==null&&eventos>=65?'Confirmar recebimento no analytics/Ads e vínculo com oportunidade no CRM':
   nivel===3?'Mapear UTMs, eventos de conversão, fonte no CRM e fluxo de qualificação':
   nivel===2?'Verificar eventos do formulário/WhatsApp e origem do lead até o CRM':
   'Validar domínio, captação e tecnologias por auditoria autorizada';
 // Índice de capacidades observadas (não mede performance). Não descontar resultados desconhecidos.
 const indiceObservavel=Math.round((dimensoes.medicao*.28+dimensoes.midia*.23+dimensoes.captacao*.20+
   dimensoes.orquestracao*.24+(eventos===null?0:eventos)*.05)/(eventos===null ? 0.95 : 1));
 const x=entre(dimensoes.medicao*.78+(eventos===null?0:eventos)*.22);
 const y=entre(dimensoes.midia*.43+dimensoes.orquestracao*.37+dimensoes.captacao*.20);
 return {conta:c,nivel,confianca,dimensoes,familias,indicios,hipotese,proximoTeste,indiceObservavel,x,y,foco:(nivel===2||nivel===3)&&confianca!=='insuficiente'};
}
export function analisarBase(contas:ContaAquisicao[]):AnaliseAquisicao[]{return contas.map(analisarConta)}
export function contagemNiveis(analises:AnaliseAquisicao[]):Record<NivelMaturidade,number>{
 const result:Record<NivelMaturidade,number>={0:0,1:0,2:0,3:0,4:0,5:0};
 for(const a of analises)result[a.nivel]++;
 return result;
}
export function pontuacaoFoco(a:AnaliseAquisicao):number {
 // Foco maior em L2 e L3 com mais evidência e fit ABM — sem "somar defeitos".
 const fit=a.conta.tier==='A'?18:a.conta.tier==='B'?10:3;
 const cap=Math.min(25,a.familias*7);
 const consistencia=a.confianca==='adequada'?17:a.confianca==='parcial'?8:0;
 const timing=Math.min(20,Math.max(0,a.conta.priority)*.20);
 const nivel=a.nivel===2?20:a.nivel===3?17:0;
 return Math.round(entre(fit+cap+consistencia+timing+nivel));
}
