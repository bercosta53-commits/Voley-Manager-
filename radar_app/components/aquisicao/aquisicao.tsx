'use client';

import { useMemo, useState } from 'react';
import { Activity, ArrowDownUp, ArrowRight, CheckCircle2, ChevronRight, CircleHelp, Database, Download, ExternalLink, Layers3, LayoutGrid, MousePointer2, Radar, Search, ShieldCheck, SlidersHorizontal, Table2, Target, X } from 'lucide-react';
import Link from 'next/link';
import { Casca } from '@/components/casca/casca';
import type { Base } from '@/lib/tipos';
import { cn } from '@/lib/utils';

type Estado = 'network' | 'html' | 'request' | 'not_observed' | 'not_tested';
type Chave = 'gtm' | 'ga4' | 'meta' | 'linkedin' | 'googleAds' | 'hubspot' | 'rdStation' | 'ploomes' | 'bitrix' | 'salesforce' | 'pipedrive' | 'mautic' | 'activeCampaign' | 'whatsapp' | 'contactForm7' | 'typeform' | 'googleForms';
type ContaAqu = {
  id:string;name:string;domain:string;tier:string;audit:string;validPages:number;forms:number;whatsappLinks:number;
  tags:Record<Chave,Estado>;priority:number;signalFamilies:number;crmHistorical:string;crmObserved:string;mediaObserved:string;
  ctaStage:string;ctaConclusion:string;ctaClicked:boolean;ctaHttp:string;cmpVisible:boolean;consent:string;
  nextValidation:string;evidence:string;historicalSource:string;limitations:string;observation:string;
};
type Dataset = {schema:string;lastUpdated:string;source:string;caveat:string;accounts:ContaAqu[]};
type Vista = 'panorama' | 'matriz' | 'prioridades';
const GRUPOS:{id:string;nome:string;sub:string;chaves:Chave[]}[]=[
 {id:'medicao',nome:'Mensuração',sub:'Tags e analytics',chaves:['gtm','ga4']},
 {id:'publicidade',nome:'Publicidade',sub:'Pixels e conversões',chaves:['googleAds','meta','linkedin']},
 {id:'crm',nome:'CRM & automação',sub:'Sinais em ambiente web',chaves:['rdStation','hubspot','ploomes','mautic','salesforce','pipedrive','bitrix','activeCampaign']},
 {id:'captacao',nome:'Captação',sub:'Formulários e WhatsApp',chaves:['whatsapp','contactForm7','typeform','googleForms']},
];
const NOMES:Record<Chave,string>={
  gtm:'Google Tag Manager',ga4:'Google Analytics 4',meta:'Meta Pixel',linkedin:'LinkedIn Insight',googleAds:'Google Ads',
  hubspot:'HubSpot',rdStation:'RD Station',ploomes:'Ploomes',bitrix:'Bitrix24',salesforce:'Salesforce',pipedrive:'Pipedrive',
  mautic:'Mautic',activeCampaign:'ActiveCampaign',whatsapp:'WhatsApp',contactForm7:'Contact Form 7',typeform:'Typeform',googleForms:'Google Forms'
};
const PRINCIPAIS:Chave[]=['gtm','ga4','googleAds','meta','linkedin','rdStation','hubspot','ploomes'];
const NIVEL:{id:Estado;texto:string;ajuda:string}[]=[
 {id:'network',texto:'Rede confirmada',ajuda:'Resposta HTTP 2xx/3xx observada durante a navegação'},
 {id:'html',texto:'Só no HTML',ajuda:'Assinatura encontrada no código, sem carregamento comprovado'},
 {id:'request',texto:'Requisição iniciada',ajuda:'Envio iniciado, resposta não confirmada'},
 {id:'not_observed',texto:'Não observado',ajuda:'Não encontrado nas páginas testadas; não significa ausente'},
 {id:'not_tested',texto:'Não testado',ajuda:'Sem páginas ou ferramenta auditável'},
];
function classeEstado(e:Estado){return e==='network'?'bg-ok':e==='html'?'bg-warm':e==='request'?'bg-cool':e==='not_observed'?'bg-border-strong':'bg-[var(--vr-surface-3)] border border-border-strong';}
function legendaEstado(e:Estado){return NIVEL.find(x=>x.id===e)?.texto||e}
function captacao(a:ContaAqu){return a.forms>0 || a.whatsappLinks>0}
function redes(a:ContaAqu){return Object.values(a.tags).filter(x=>x==='network').length}
function p(v:number,d:number){return d?Math.round(v*100/d):0}
function cssUrl(url:string){try{const u=new URL(url);return u.protocol==='https:'?url:'#'}catch{return '#'}}
function csvCell(v:unknown){const s=String(v??'');return '"'+s.replaceAll('"','""')+'"'}
function downloadCsv(rows:ContaAqu[]){
 const cols=['ID','Empresa','Domínio','Tier','Prioridade de diagnóstico','Páginas auditadas','Formulários','Links WhatsApp',...PRINCIPAIS.map(k=>NOMES[k]),'CRM histórico','Evento CTA','Fonte técnica'];
 const lines=[cols.map(csvCell).join(';'),...rows.map(a=>[a.id,a.name,a.domain,a.tier,a.priority,a.validPages,a.forms,a.whatsappLinks,...PRINCIPAIS.map(k=>legendaEstado(a.tags[k])),a.crmHistorical,a.ctaConclusion,a.evidence].map(csvCell).join(';'))];
 const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
 const href=URL.createObjectURL(blob);const el=document.createElement('a');el.href=href;el.download='velora-aquisicao-filtrado.csv';el.click();setTimeout(()=>URL.revokeObjectURL(href),1500);
}
function Chip({children,tom='neutro'}:{children:React.ReactNode;tom?:'neutro'|'sucesso'|'alerta'|'acido'}){
 const toms={neutro:'border-border bg-[var(--vr-surface-2)] text-text-2',sucesso:'border-ok/30 bg-ok-bg text-ok',alerta:'border-warm/30 bg-warm-bg text-warm',acido:'border-acid/40 bg-acid-soft text-foreground'};
 return <span className={cn('inline-flex items-center gap-1.5 rounded-chip border px-2 py-1 text-xs font-medium',toms[tom])}>{children}</span>;
}
function Ponto({estado,tamanho='size-2.5'}:{estado:Estado;tamanho?:string}){return <span className={cn('inline-block shrink-0 rounded-full',tamanho,classeEstado(estado))} title={legendaEstado(estado)} aria-label={legendaEstado(estado)}/>;}
function CartaoNumero({titulo,numero,detalhe,icone:Icone}:{titulo:string;numero:string;detalhe:string;icone:typeof Activity}){
 return <div className="vr-card flex min-w-0 flex-col justify-between p-4 md:p-5">
  <div className="flex items-start justify-between gap-2"><span className="text-xs font-medium text-text-3">{titulo}</span><Icone className="size-4 text-text-3" strokeWidth={1.5}/></div>
  <strong className="vr-data my-2 text-3xl font-semibold tabular-nums tracking-tight md:text-4xl">{numero}</strong>
  <span className="text-xs leading-5 text-text-3">{detalhe}</span>
 </div>;
}
function Barra({rotulo,valor,maximo,legenda,onClick}:{rotulo:string;valor:number;maximo:number;legenda?:string;onClick?:()=>void}){
 const area=<><div className="mb-1.5 flex items-center justify-between gap-2 text-xs"><span className="font-medium text-text-2">{rotulo}</span><span className="vr-data text-foreground">{legenda||String(valor)}</span></div>
  <div className="h-2.5 overflow-hidden rounded-chip bg-[var(--vr-surface-3)]"><div className="h-full rounded-chip bg-foreground transition-[width] duration-300" style={{width:String(p(valor,Math.max(maximo,1)))+'%'}}/></div></>;
 return onClick?<button type="button" onClick={onClick} className="block w-full rounded-control p-1 text-left hover:bg-[var(--vr-surface-2)]">{area}</button>:<div>{area}</div>;
}
function NomeFonte({item}:{item:ContaAqu}){return <span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground">{item.name}</span><span className="vr-data block truncate text-[11px] text-text-3">{item.id} · {item.domain}</span></span>;}
function PainelEmpresa({item,onClose,contaRadarId}:{item:ContaAqu;onClose:()=>void;contaRadarId?:string}){
 const total=Object.values(item.tags).filter(x=>x==='network').length;
 const baseHref=cssUrl(item.evidence),site='https://'+item.domain;
 return <div className="fixed inset-0 z-50 flex justify-end bg-black/35" role="presentation" onMouseDown={onClose}>
  <aside role="dialog" aria-modal="true" aria-label={'Aquisição de '+item.name} className="h-full w-full max-w-[640px] overflow-y-auto border-l border-border bg-background shadow-3" onMouseDown={e=>e.stopPropagation()}>
   <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-background px-5 py-5 md:px-7">
    <div className="min-w-0"><p className="mb-1 text-[11px] font-semibold uppercase tracking-[.15em] text-text-3">Dossiê técnico de aquisição · {item.id}</p><h2 className="font-display text-xl font-semibold md:text-2xl">{item.name}</h2><p className="mt-1 text-xs text-text-3">{item.domain} · Tier {item.tier}</p></div>
    <button type="button" aria-label="Fechar dossiê" className="rounded-control border border-border p-2 hover:bg-[var(--vr-surface-2)]" onClick={onClose}><X className="size-4"/></button>
   </header>
   <div className="space-y-5 px-5 py-6 md:px-7">
    <div className="grid grid-cols-3 gap-2">
     <div className="vr-card p-3"><span className="text-[11px] text-text-3">Prioridade de diagnóstico</span><p className="vr-data mt-1 text-2xl font-semibold">{item.priority}<span className="text-sm text-text-3">/100</span></p></div>
     <div className="vr-card p-3"><span className="text-[11px] text-text-3">Tecnologias na rede</span><p className="vr-data mt-1 text-2xl font-semibold">{total}</p></div>
     <div className="vr-card p-3"><span className="text-[11px] text-text-3">Páginas válidas</span><p className="vr-data mt-1 text-2xl font-semibold">{item.validPages}</p></div>
    </div>
    <div className="rounded-control border border-border bg-[var(--vr-surface-2)] p-4">
     <div className="mb-2 flex flex-wrap items-center gap-2"><Chip tom={item.validPages>0?'sucesso':'alerta'}>{item.validPages>0?'Site auditado':'Auditoria inconclusiva'}</Chip><Chip>Tier {item.tier}</Chip></div>
     <p className="text-xs leading-5 text-text-2"><strong>Nota de método:</strong> prioridade é interesse para aprofundamento, não fragilidade comprovada. Um CRM detectado no front-end não comprova uso interno, e pixel não significa campanha ativa.</p>
    </div>
    {GRUPOS.map(g=><section key={g.id} className="vr-card p-4">
      <div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-semibold">{g.nome}</h3><p className="mt-0.5 text-xs text-text-3">{g.sub}</p></div><span className="vr-data text-sm text-text-3">{g.chaves.filter(k=>item.tags[k]==='network').length}/{g.chaves.length}</span></div>
      <div className="grid gap-2 sm:grid-cols-2">{g.chaves.map(k=><div key={k} className="flex min-w-0 items-center gap-2 rounded-control border border-border px-2.5 py-2"><Ponto estado={item.tags[k]}/><span className="min-w-0 flex-1 truncate text-xs">{NOMES[k]}</span><span className="text-[10px] text-text-3">{item.tags[k]==='network'?'Rede':item.tags[k]==='html'?'HTML':item.tags[k]==='not_observed'?'N/obs.':'N/test.'}</span></div>)}</div>
      {g.id==='captacao'&&<p className="mt-3 border-t border-border pt-3 text-xs text-text-3">Formulários no DOM: <b className="text-foreground">{item.forms}</b> · Links WhatsApp no DOM: <b className="text-foreground">{item.whatsappLinks}</b></p>}
      {g.id==='crm'&&<p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-text-3">Histórico BuiltWith: {item.crmHistorical||'Não identificado'}</p>}
    </section>)}
    <section className="vr-card p-4"><h3 className="mb-3 text-sm font-semibold">Eventos & consentimento</h3>
      <dl className="space-y-3 text-xs">
       <div className="flex justify-between gap-4 border-b border-border pb-2"><dt className="text-text-3">Etapa da auditoria</dt><dd className="max-w-[55%] text-right font-medium">{item.ctaStage||'Não testado'}</dd></div>
       <div className="flex justify-between gap-4 border-b border-border pb-2"><dt className="text-text-3">Resultado do clique</dt><dd className="max-w-[55%] break-words text-right font-medium">{item.ctaConclusion||'Sem resultado conclusivo'}</dd></div>
       <div className="flex justify-between gap-4 border-b border-border pb-2"><dt className="text-text-3">Evento HTTP comercial (L11)</dt><dd className="max-w-[55%] text-right font-medium">{item.ctaHttp||'Não verificado'}</dd></div>
       <div className="flex justify-between gap-4"><dt className="text-text-3">Banner CMP observado (L11)</dt><dd className="font-medium">{item.cmpVisible?'Sim':'Não observado / sem teste'}</dd></div>
      </dl>
    </section>
    <section className="rounded-card border border-acid/40 bg-acid-soft/30 p-4"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Target className="size-4"/> Próxima investigação</h3><p className="mb-0 text-sm leading-6 text-text-2">{item.nextValidation||'Validar infraestrutura de aquisição e integração CRM com acesso autorizado.'}</p></section>
    <div className="flex flex-wrap gap-2">
     {contaRadarId&&<Link href={"/contas/"+contaRadarId} className="inline-flex items-center gap-1.5 rounded-control bg-foreground px-3 py-2 text-xs font-semibold text-background hover:opacity-85"><ArrowRight className="size-3.5"/> Abrir conta no Radar</Link>}
     {baseHref!=='#'&&<a href={baseHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-control border border-border px-3 py-2 text-xs font-semibold hover:bg-[var(--vr-surface-2)]"><ExternalLink className="size-3.5"/> Evidência técnica</a>}
     <a href={cssUrl(item.historicalSource)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-control border border-border px-3 py-2 text-xs font-semibold hover:bg-[var(--vr-surface-2)]"><ExternalLink className="size-3.5"/> BuiltWith</a>
     <a href={site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-control border border-border px-3 py-2 text-xs font-semibold hover:bg-[var(--vr-surface-2)]"><ExternalLink className="size-3.5"/> Site</a>
    </div>
   </div>
  </aside>
 </div>
}
export function TelaAquisicao({base,dados}:{base:Base;dados:Dataset}){
 const [vista,setVista]=useState<Vista>('panorama');
 const [texto,setTexto]=useState('');const [tier,setTier]=useState('todos');const [grupo,setGrupo]=useState('todos');
 const [status,setStatus]=useState('todos');const [ordenacao,setOrdenacao]=useState('prioridade');
 const [selecionada,setSelecionada]=useState<ContaAqu|null>(null);
 const [selecionadaFerramenta,setSelecionadaFerramenta]=useState<Chave|'todas'>('todas');
 const todas=dados.accounts;
 const validas=todas.filter(a=>a.validPages>0);
 const lista=useMemo(()=>{
  const q=texto.trim().toLocaleLowerCase('pt-BR');
  return todas.filter(a=>
   (!q || [a.name,a.domain,a.id,a.crmHistorical].some(s=>s.toLocaleLowerCase('pt-BR').includes(q))) &&
   (tier==='todos'||a.tier===tier) &&
   (grupo==='todos'|| (grupo==='crm'?GRUPOS[2].chaves.some(k=>a.tags[k]==='network'):grupo==='midia'?GRUPOS[1].chaves.some(k=>a.tags[k]==='network'):grupo==='capta'?captacao(a):grupo==='insuficiente'?a.validPages===0:true)) &&
   (status==='todos'||status==='network'&&selecionadaFerramenta!=='todas'&&a.tags[selecionadaFerramenta]==='network'||
    status==='html'&&selecionadaFerramenta!=='todas'&&a.tags[selecionadaFerramenta]==='html'||
    status==='sem-evento'&&a.ctaConclusion.includes('SEM_EVENTO')||
    status==='cta'&&a.ctaStage!=='Sem auditoria CTA')
  ).sort((a,b)=>ordenacao==='empresa'?a.name.localeCompare(b.name,'pt-BR'):ordenacao==='stack'?redes(b)-redes(a)||b.priority-a.priority:
    ordenacao==='tier'?a.tier.localeCompare(b.tier)||b.priority-a.priority:b.priority-a.priority||b.signalFamilies-a.signalFamilies);
 },[todas,texto,tier,grupo,status,ordenacao,selecionadaFerramenta]);
 const registrosRede=(k:Chave)=>validas.filter(a=>a.tags[k]==='network').length;
 const crm=validas.filter(a=>GRUPOS[2].chaves.some(k=>a.tags[k]==='network')).length;
 const resultAvaliado=todas.filter(a=>a.ctaStage&&a.ctaStage!=='Sem auditoria CTA').length;
 function filtrarFerramenta(k:Chave){setSelecionadaFerramenta(k);setStatus('network');setVista('matriz')}
 const contasDoRadar=new Map(base.contas.map(c=>[c.dominio.toLowerCase().replace(/^www\./,''),c.id]));
 const contaNoRadar=(item:ContaAqu)=>contasDoRadar.get(item.domain.toLowerCase().replace(/^www\./,''));
 const controles=<div className="mb-5 flex flex-wrap items-center gap-2">
   <div className="relative min-w-[220px] flex-1 md:max-w-[380px]"><Search className="absolute left-3 top-2.5 size-4 text-text-3"/><input aria-label="Buscar empresa, domínio ou ferramenta" className="h-9 w-full rounded-control border border-border-strong bg-card py-2 pl-9 pr-3 text-sm outline-none placeholder:text-text-3" value={texto} placeholder="Buscar empresa, domínio, CRM..." onChange={e=>setTexto(e.target.value)}/></div>
   <select aria-label="Filtrar Tier" value={tier} onChange={e=>setTier(e.target.value)} className="h-9 rounded-control border border-border-strong bg-card px-3 text-xs"><option value="todos">Todos os tiers</option>{['A','B','C'].map(t=><option key={t} value={t}>Tier {t}</option>)}</select>
   <select aria-label="Filtrar categoria" value={grupo} onChange={e=>setGrupo(e.target.value)} className="h-9 rounded-control border border-border-strong bg-card px-3 text-xs"><option value="todos">Todas categorias</option><option value="midia">Com mídia detectada</option><option value="crm">CRM web detectado</option><option value="capta">Com captação visível</option><option value="insuficiente">Auditoria pendente</option></select>
   <select aria-label="Filtrar evidência" value={status} onChange={e=>setStatus(e.target.value)} className="h-9 rounded-control border border-border-strong bg-card px-3 text-xs"><option value="todos">Todas evidências</option>{selecionadaFerramenta!=='todas'&&<><option value="network">Rede: {NOMES[selecionadaFerramenta]}</option><option value="html">HTML: {NOMES[selecionadaFerramenta]}</option></>}<option value="cta">Com auditoria CTA</option><option value="sem-evento">CTA sem evento observado</option></select>
   <button type="button" className="flex h-9 items-center gap-1.5 rounded-control border border-border px-3 text-xs font-medium hover:bg-[var(--vr-surface-2)]" onClick={()=>downloadCsv(lista)}><Download className="size-3.5"/> Exportar CSV</button>
   {(texto||tier!=='todos'||grupo!=='todos'||status!=='todos')&&<button type="button" onClick={()=>{setTexto('');setTier('todos');setGrupo('todos');setStatus('todos');setSelecionadaFerramenta('todas')}} className="h-9 px-2 text-xs font-semibold text-text-3 hover:text-foreground">Limpar</button>}
 </div>;
 return <Casca base={base}><main className="w-full max-w-[1600px] px-4 pt-2 pb-28 md:px-8 md:pt-8 md:pb-16">
  <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
   <div><p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.17em] text-text-3"><span className="inline-block size-1.5 rounded-full bg-ok"/> Intelligence / GTM Stack</p><h1 className="font-display text-3xl font-semibold tracking-tight">Aquisição</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-text-2">O que a empresa usa para atrair, medir e converter. Explore o stack por conta, compare evidências e priorize auditorias de Growth & Vendas.</p></div>
   <div className="flex flex-wrap gap-2 pt-1"><Chip tom="sucesso"><CheckCircle2 className="size-3.5"/> Dados L11 · 08 nov 2026</Chip><Chip>120 contas analisadas</Chip></div>
  </div>
  <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores de aquisição">
   <CartaoNumero titulo="Contas mapeadas" numero={String(todas.length)} detalhe="Inventário técnico de empresas" icone={Database}/>
   <CartaoNumero titulo="Sites auditados" numero={String(validas.length)} detalhe={p(validas.length,todas.length)+'% com navegação válida'} icone={ShieldCheck}/>
   <CartaoNumero titulo="GA4 observado" numero={String(registrosRede('ga4'))} detalhe={p(registrosRede('ga4'),validas.length)+'% dos sites auditados'} icone={Activity}/>
   <CartaoNumero titulo="CRM/automação web" numero={String(crm)} detalhe="Assinaturas carregadas na rede, não CRM interno" icone={Layers3}/>
  </section>
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border">
   <div role="tablist" aria-label="Visões de aquisição" className="flex gap-4 overflow-x-auto">
    {([{id:'panorama',label:'Visão geral',icon:LayoutGrid},{id:'matriz',label:'Matriz tecnológica',icon:Table2},{id:'prioridades',label:'Fila de investigação',icon:Target}] as const).map(({id,label,icon:Icone})=><button role="tab" aria-selected={vista===id} key={id} onClick={()=>setVista(id)} className={cn('flex min-h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-2 pt-1 text-sm font-semibold transition-colors',vista===id?'border-foreground text-foreground':'border-transparent text-text-3 hover:text-foreground')}><Icone className="size-4" strokeWidth={1.7}/>{label}</button>)}
   </div>
   <span className="mb-2 text-xs text-text-3">{lista.length} de {todas.length} contas</span>
  </div>
  {controles}
  {vista==='panorama'&&<div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
   <section className="vr-card p-5 md:p-6"><div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Mapa de instrumentação</h2><p className="mt-1 text-xs text-text-3">Resposta HTTP observada / {validas.length} sites auditados. Clique em uma tecnologia para filtrar.</p></div><Chip>Fonte: Playwright</Chip></div>
    <div className="grid gap-6 md:grid-cols-2">{GRUPOS.slice(0,3).map(g=><div key={g.id}><h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-3">{g.nome}</h3><div className="space-y-3">{g.chaves.map(k=><Barra key={k} rotulo={NOMES[k]} valor={registrosRede(k)} maximo={validas.length} legenda={String(registrosRede(k))+' · '+p(registrosRede(k),validas.length)+'%'} onClick={()=>filtrarFerramenta(k)}/>)}</div></div>)}
      <div><h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-3">Captação no DOM</h3><div className="space-y-3"><Barra rotulo="Formulário visível" valor={validas.filter(a=>a.forms>0).length} maximo={validas.length}/><Barra rotulo="Link de WhatsApp" valor={validas.filter(a=>a.whatsappLinks>0).length} maximo={validas.length}/></div><p className="mt-4 text-[11px] leading-5 text-text-3">Presença em HTML e DOM não comprova funcionamento de conversão ou integração com o CRM.</p></div>
    </div>
   </section>
   <div className="space-y-4">
    <section className="vr-card p-5"><h2 className="text-base font-semibold">Qualidade da evidência</h2><p className="mt-1 text-xs text-text-3">A ausência de observação não é diagnóstico de falha.</p>
      <div className="mt-5 flex h-3 overflow-hidden rounded-control bg-[var(--vr-surface-3)]">{[...NIVEL].map(item=>{const n=validas.filter(a=>a.tags.ga4===item.id).length;return <div key={item.id} className={classeEstado(item.id)} style={{width:String(p(n,validas.length))+'%'}} title={item.texto+': '+n}/>})}</div>
      <div className="mt-4 space-y-2">{NIVEL.map(item=><div key={item.id} className="flex items-center gap-2 text-xs"><Ponto estado={item.id}/><span className="flex-1 text-text-2">{item.texto}</span><b className="vr-data">{validas.filter(a=>a.tags.ga4===item.id).length}</b></div>)}</div>
      <p className="mt-4 border-t border-border pt-3 text-[11px] text-text-3">Exemplo: estados do GA4 na amostra tecnicamente auditada.</p>
    </section>
    <section className="vr-card p-5"><div className="mb-4 flex items-center gap-2"><MousePointer2 className="size-4 text-text-2"/><h2 className="text-base font-semibold">Eventos de conversão</h2></div>
      <div className="grid grid-cols-2 gap-2"><div className="rounded-control bg-[var(--vr-surface-2)] p-3"><div className="vr-data text-2xl font-semibold">{resultAvaliado}</div><p className="mt-0.5 text-xs text-text-3">contas com etapa CTA</p></div>
      <div className="rounded-control bg-[var(--vr-surface-2)] p-3"><div className="vr-data text-2xl font-semibold">{todas.filter(a=>!!a.ctaHttp).length}</div><p className="mt-0.5 text-xs text-text-3">eventos HTTP detalhados no L11</p></div></div>
      <p className="mt-3 text-[11px] leading-5 text-text-3">A análise de clique tem cobertura parcial. Não extrapolar eventos observados para as 120 contas.</p>
    </section>
   </div>
   <section className="vr-card p-5 md:p-6 xl:col-span-2"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Empresas para aprofundar</h2><p className="mt-1 text-xs text-text-3">Prioridade L08 · não representa deficiência tecnológica.</p></div><button className="flex items-center gap-1 text-xs font-semibold hover:underline" onClick={()=>setVista('prioridades')}>Abrir fila completa <ArrowRight className="size-3.5"/></button></div>
      <div className="grid gap-2 md:grid-cols-5">{[...lista].sort((a,b)=>b.priority-a.priority).slice(0,5).map(a=><button key={a.id} onClick={()=>setSelecionada(a)} className="rounded-control border border-border bg-[var(--vr-surface-2)] p-3 text-left transition-colors hover:border-border-strong hover:bg-[var(--vr-surface-3)]"><div className="flex justify-between"><Chip>Tier {a.tier}</Chip><span className="vr-data text-lg font-semibold">{a.priority}</span></div><p className="mt-4 line-clamp-2 min-h-10 text-sm font-semibold">{a.name}</p><p className="mt-1 truncate text-[11px] text-text-3">{a.signalFamilies} famílias · {redes(a)} sinais web</p></button>)}</div>
   </section>
  </div>}
  {vista==='matriz'&&<section className="vr-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 md:px-5"><div><h2 className="text-sm font-semibold">Matriz de tecnologias</h2><p className="mt-1 text-xs text-text-3">Clique na linha para abrir as evidências. Pontos coloridos representam estados diferentes, não maturidade.</p></div><div className="flex flex-wrap gap-3">{NIVEL.slice(0,4).map(v=><span className="flex items-center gap-1 text-[10px] text-text-3" key={v.id}><Ponto estado={v.id} tamanho="size-2"/>{v.texto}</span>)}</div></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[990px] text-left text-xs"><thead className="sticky top-0 z-10 bg-[var(--vr-surface-2)]"><tr><th className="sticky left-0 z-20 min-w-[240px] border-b border-r border-border bg-[var(--vr-surface-2)] px-4 py-3 font-semibold">EMPRESA</th><th className="border-b border-border px-3 py-3">TIER</th><th className="border-b border-border px-3 py-3">PRIOR.</th>{PRINCIPAIS.map(k=><th className="min-w-12 border-b border-border px-2 py-3 text-center font-medium text-text-3" key={k} title={NOMES[k]}>{k==='googleAds'?'Ads':k==='rdStation'?'RD':k==='linkedin'?'LI':k==='hubspot'?'Hub':k==='ploomes'?'Ploo':k.toUpperCase()}</th>)}<th className="border-b border-border px-3 py-3">CAPTAÇÃO</th><th className="border-b border-border px-3 py-3">AUDITORIA</th></tr></thead><tbody>
      {lista.map(a=><tr key={a.id} onClick={()=>setSelecionada(a)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setSelecionada(a)}} className="group cursor-pointer border-b border-border/70 hover:bg-[var(--vr-surface-2)] focus:bg-[var(--vr-surface-2)]">
       <td className="sticky left-0 z-[1] max-w-[280px] border-r border-border bg-card px-4 py-3 group-hover:bg-[var(--vr-surface-2)]"><NomeFonte item={a}/></td><td className="px-3 py-3 font-semibold">{a.tier}</td><td className="vr-data px-3 py-3 font-semibold">{a.priority}</td>{PRINCIPAIS.map(k=><td className="px-2 py-3 text-center" key={k}><Ponto estado={a.tags[k]} tamanho="size-3"/></td>)}<td className="px-3 py-3"><span title="Formulários / Links WhatsApp" className="vr-data whitespace-nowrap">{a.forms} F / {a.whatsappLinks} W</span></td><td className="px-3 py-3"><Chip tom={a.validPages>0?'sucesso':'alerta'}>{a.validPages>0?'Auditado':'Pendente'}</Chip></td>
      </tr>)}</tbody></table>{!lista.length&&<p className="p-10 text-center text-sm text-text-3">Nenhuma empresa corresponde aos filtros atuais.</p>}</div>
  </section>}
  {vista==='prioridades'&&<div className="grid gap-4 xl:grid-cols-[1fr_330px]">
   <section className="vr-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">Fila de investigação</h2><p className="mt-1 text-xs text-text-3">Classificação original L08, sem inferir falhas comprovadas.</p></div>
    <select value={ordenacao} onChange={e=>setOrdenacao(e.target.value)} aria-label="Ordenação" className="h-8 rounded-control border border-border-strong bg-card px-2 text-xs"><option value="prioridade">Maior prioridade</option><option value="stack">Mais tecnologias em rede</option><option value="tier">Tier A primeiro</option><option value="empresa">Nome A–Z</option></select></div>
    <div className="divide-y divide-border">{lista.slice(0,80).map(a=><button type="button" onClick={()=>setSelecionada(a)} key={a.id} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--vr-surface-2)] md:px-5"><span className="vr-data grid size-10 shrink-0 place-items-center rounded-control bg-[var(--vr-surface-2)] text-sm font-semibold">{a.priority}</span><div className="min-w-0 flex-1"><NomeFonte item={a}/><div className="mt-1.5 flex flex-wrap gap-1.5"><Chip>Tier {a.tier}</Chip><Chip>{a.signalFamilies} famílias</Chip>{a.validPages>0&&<Chip tom="sucesso">Auditado</Chip>}</div></div><ChevronRight className="size-4 shrink-0 text-text-3"/></button>)}{lista.length>80&&<div className="p-4 text-center text-xs text-text-3">Mostrando as primeiras 80 contas; use os filtros para refinar a fila.</div>}</div>
   </section>
   <aside className="space-y-4"><section className="vr-card p-5"><h3 className="mb-3 text-sm font-semibold">Como ler essa fila</h3><p className="text-sm leading-6 text-text-2">A prioridade valoriza a presença combinada de mídias, captação e tecnologias web de CRM. Pontos indicam onde aprofundar o diagnóstico, não onde já foi comprovada uma operação frágil.</p><div className="mt-4 rounded-control bg-warm-bg p-3 text-xs leading-5 text-warm"><CircleHelp className="mb-2 size-4"/>Uma empresa com tags bem instrumentadas ainda pode ter oportunidade de eficiência GTM. O inverso também é verdadeiro.</div></section>
    <section className="vr-card p-5"><h3 className="mb-3 text-sm font-semibold">Perguntas de diagnóstico</h3><div className="space-y-3 text-xs leading-5 text-text-2"><p>01 · O clique vira evento mensurável e atribuído?</p><p>02 · Há fonte/UTM preservada até o CRM?</p><p>03 · O time comercial registra e acompanha os leads?</p><p>04 · Há campanhas ativas e governança de conversões?</p></div></section>
   </aside>
  </div>}
  <div className="mt-6 flex flex-wrap items-start gap-2 rounded-card border border-border bg-[var(--vr-surface-2)] px-4 py-3 text-[11px] leading-5 text-text-3"><ShieldCheck className="mt-0.5 size-4 shrink-0"/><p className="m-0 flex-1"><strong>Metodologia:</strong> {dados.caveat} Fonte: {dados.source}. Não foram enviados formulários ou mensagens. A cobertura técnica das 120 contas é parcial, e a pontuação é usada apenas para decidir onde investigar.</p></div>
 </main>{selecionada&&<PainelEmpresa item={selecionada} contaRadarId={contaNoRadar(selecionada)} onClose={()=>setSelecionada(null)}/>}</Casca>;
}
