/** Velora CRM depth model v3.
 * CRM features offered by a vendor are not proof of active customer use.
 * Script, historical lookup, and operationally validated CRM are separate evidence levels.
 */
import type { ContaAquisicao } from './aquisicao-maturidade';

export type ProvaCRM = {
 fornecedor:string;
 edicao?:string; // e.g. Sales Hub Professional, Enterprise, Starter (must be verified separately)
 ativo:boolean;
 pipelineComercial:boolean;
 reviewer:string;
 verifiedAt:string;
 sourceUrl:string;
};

export type AvaliacaoCRM = {
 fornecedor:string;
 score:number;
 categoria:'enterprise'|'crm_comercial'|'automacao'|'desconhecida';
 origem:'operacional_validado'|'script_web'|'historico'|'sem_evidencia';
 confirmado:boolean;
 potencialEnterprise:boolean;
 descricao:string;
 observacao:string;
 proximaValidacao:string;
};

type Regra={fornecedor:string;categoria:AvaliacaoCRM['categoria'];web:number;verificado:number};
const WEB:Record<string,Regra>={
 salesforce:{fornecedor:'Salesforce',categoria:'enterprise',web:52,verificado:91},
 hubspot:{fornecedor:'HubSpot',categoria:'enterprise',web:46,verificado:84},
 pipedrive:{fornecedor:'Pipedrive',categoria:'crm_comercial',web:34,verificado:61},
 ploomes:{fornecedor:'Ploomes',categoria:'crm_comercial',web:32,verificado:59},
 bitrix:{fornecedor:'Bitrix24',categoria:'crm_comercial',web:27,verificado:54},
 rdStation:{fornecedor:'RD Station',categoria:'automacao',web:18,verificado:47},
 activeCampaign:{fornecedor:'ActiveCampaign',categoria:'automacao',web:14,verificado:41},
 mautic:{fornecedor:'Mautic',categoria:'automacao',web:11,verificado:34}
};
const PROVEDORES:Record<string,{categoria:AvaliacaoCRM['categoria'];score:number}>={
 'salesforce':{categoria:'enterprise',score:91},
 'hubspot':{categoria:'enterprise',score:84},
 'microsoft dynamics 365':{categoria:'enterprise',score:89},
 'dynamics 365':{categoria:'enterprise',score:89},
 'pipedrive':{categoria:'crm_comercial',score:61},
 'ploomes':{categoria:'crm_comercial',score:59},
 'bitrix24':{categoria:'crm_comercial',score:54},
 'rd vendas':{categoria:'crm_comercial',score:47},
 'rd station crm':{categoria:'crm_comercial',score:47},
 'zoho crm':{categoria:'crm_comercial',score:56}
};
function proofIsValid(p:ProvaCRM|undefined):p is ProvaCRM{
 if(!p||p.ativo!==true||p.pipelineComercial!==true||!p.verifiedAt||!p.reviewer)return false;
 try{const u=new URL(p.sourceUrl);return u.protocol==='https:';}catch{return false;}
}
function ruleForProvider(p:ProvaCRM){
 const key=p.fornecedor.trim().toLowerCase();
 const rule=PROVEDORES[key]||{categoria:'desconhecida' as const,score:35};
 const edition=(p.edicao||'').toLowerCase();
 if(key==='hubspot'){
  if(/enterprise|professional|sales hub pro/.test(edition))return {...rule,score:94};
  if(/starter|free|gratuito/.test(edition))return {...rule,score:68};
 }
 if(key==='salesforce'){
  if(/enterprise|unlimited|performance/.test(edition))return {...rule,score:98};
  if(/starter|essentials/.test(edition))return {...rule,score:75};
 }
 return rule;
}

export function avaliarCrm(c:ContaAquisicao):AvaliacaoCRM {
 if(proofIsValid(c.crmOperacional)){
  const p=c.crmOperacional;
  const cfg=ruleForProvider(p);
  return {
   fornecedor:p.fornecedor,score:cfg.score,categoria:cfg.categoria,origem:'operacional_validado',
   confirmado:true,potencialEnterprise:cfg.categoria==='enterprise',
   descricao:'CRM comercial ativo e pipeline confirmados por evidência operacional',
   observacao:'Uso validado não comprova sozinho atribuição à receita nem maturidade L4.',
   proximaValidacao:'Confirmar origem/UTM, oportunidades, receita e governança operacional no CRM.'
  };
 }
 // Web integrations / trackers are *not* a CRM implementation proof.
 const detected=Object.entries(WEB).filter(([k])=>c.tags[k]==='network').sort((a,b)=>b[1].web-a[1].web);
 if(detected.length){
  const [key,best]=detected[0];
  const bonus=Math.min(5,Math.max(0,detected.length-1)*3);
  return {fornecedor:best.fornecedor,score:Math.min(56,best.web+bonus),
   categoria:best.categoria,origem:'script_web',confirmado:false,
   potencialEnterprise:key==='hubspot'||key==='salesforce',
   descricao:'Tecnologia identificada em requisições do site — CRM comercial não verificado',
   observacao:key==='rdStation'?'RD Marketing (script web) não comprova RD Vendas/CRM.':
    key==='hubspot'?'Script HubSpot não comprova Sales Hub, plano ou pipeline comercial.':
    'Script web não comprova integração ou uso comercial efetivo.',
   proximaValidacao:key==='hubspot'||key==='salesforce'?'Confirmar CRM comercial, edição/licença, funil e utilização pela equipe.':
    'Verificar produto específico, uso no funil comercial e integração Marketing–Vendas.'};
 }
 const historic=(c.historicalTech||[]).find(x=>/salesforce|hubspot|dynamics|pipedrive|rd station|ploomes|bitrix/i.test(x));
 if(historic) return {
  fornecedor:historic,score:0,categoria:'desconhecida',origem:'historico',confirmado:false,potencialEnterprise:false,
  descricao:'Registro histórico do provedor, sem confirmação no navegador',
  observacao:'Histórico não acrescenta pontos de maturidade. Pode orientar a próxima checagem.',
  proximaValidacao:'Confirmar fornecedor, produto, edição, situação atual e uso no CRM.'
 };
 return {fornecedor:'Não identificado',score:0,categoria:'desconhecida',origem:'sem_evidencia',confirmado:false,
  potencialEnterprise:false,descricao:'Não há prova positiva nesta auditoria',
  observacao:'Não observado não significa CRM ausente.',
  proximaValidacao:'Investigar CRM e processo comercial em entrevista autorizada.'};
}
