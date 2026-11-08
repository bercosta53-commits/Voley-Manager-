'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
 Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Check, ChevronRight,
 Compass, Download, ExternalLink, Eye, Fingerprint, Layers3, Search, ShieldAlert, SlidersHorizontal, Target, X
} from 'lucide-react';
import { Casca } from '@/components/casca/casca';
import type { Base } from '@/lib/tipos';
import {
 analisarBase, contagemNiveis, pontuacaoFoco, NIVEIS, GRUPO_TRACKING, GRUPO_MIDIA, GRUPO_CRM,
 NOMES_TECNOLOGIAS, quantidade, type AnaliseAquisicao, type Confianca, type DadosAquisicao, type NivelMaturidade
} from '@/lib/aquisicao-maturidade';
import { cn } from '@/lib/utils';

const fmt=(n:number)=>n.toLocaleString('pt-BR');
const percent=(n:number,d:number)=>d?Math.round(100*n/d):0;
const NIVEL_LABEL:Record<number,string>={0:'Sem classificação',1:'Presença inicial',2:'Aquisição emergente',3:'Operação estruturada',4:'Integrada por dados',5:'Otimização contínua'};
const corNivel=(n:number)=>NIVEIS.find(x=>x.nivel===n)?.cor||'#a1a9a6';
const secao='rounded-[10px] border border-border bg-card shadow-1';
function delta(a:AnaliseAquisicao) { return a.nivel===2?'Potencial de estruturar aquisição e conexão com vendas':a.nivel===3?'Potencial de integrar canais, dados e receita':a.hipotese; }
function LabelCaps({children}:{children:React.ReactNode}){return <span className="text-[10px] font-semibold uppercase tracking-[.15em] text-text-3">{children}</span>;}
function SeloNivel({nivel,escuro=false}:{nivel:NivelMaturidade;escuro?:boolean}){
 const c=corNivel(nivel);
 return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-[5px] border px-2 py-1 text-[11px] font-semibold',escuro?'border-white/20 bg-white/10 text-white':'border-border bg-[var(--vr-surface-2)] text-foreground')}>
   <span className="size-[7px] rounded-[2px]" style={{backgroundColor:c}}/>{nivel===0?'Não classificada':'L'+nivel}
 </span>;
}
function SeloConfianca({estado}:{estado:Confianca}) {
 const m={adequada:'Cobertura web adequada',parcial:'Cobertura parcial',insuficiente:'Evidência insuficiente'};
 return <span className="inline-flex items-center gap-1 text-[11px] text-text-3"><span className={cn('size-1.5 rounded-full',estado==='adequada'?'bg-ok':estado==='parcial'?'bg-warm':'bg-border-strong')}/>{m[estado]}</span>;
}
function Metric({label,numero,desc,icon:Icon}:{label:string;numero:string;desc:string;icon:typeof Target}){
 return <div className={cn(secao,'flex flex-col justify-between gap-3 p-4 sm:p-5')}>
  <div className="flex items-center justify-between gap-3"><LabelCaps>{label}</LabelCaps><Icon className="size-4 text-text-3" strokeWidth={1.6}/></div>
  <div><div className="vr-data text-[32px] font-semibold tracking-[-.07em] leading-none md:text-[38px]">{numero}</div><p className="mb-0 mt-2 text-[11px] leading-5 text-text-3">{desc}</p></div>
 </div>;
}
function Progressao({analises,active,onPick}:{analises:AnaliseAquisicao[];active:number;onPick:(v:number)=>void}){
 const counts=contagemNiveis(analises);
 return <section className={cn(secao,'overflow-hidden')}>
  <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 md:px-6"><div><LabelCaps>Modelo de maturidade</LabelCaps><h2 className="mt-1 text-lg font-semibold tracking-tight">Cinco estágios. Duas zonas de oportunidade.</h2><p className="mt-1 text-xs text-text-3">Distribuição por capacidades técnicas observadas. Clique em um estágio para filtrar.</p></div><span className="hidden rounded-chip border border-border px-2 py-1 text-[10px] text-text-3 sm:inline-flex">Modelo v1 · inferência conservadora</span></div>
  <div className="grid grid-cols-2 divide-x divide-border md:grid-cols-5">
  {NIVEIS.map(n=>{const count=counts[n.nivel];const focus=n.nivel===2||n.nivel===3;
   return <button type="button" key={n.nivel} onClick={()=>onPick(active===n.nivel?-1:n.nivel)}
    className={cn('group relative flex min-h-[172px] flex-col p-4 text-left transition-colors hover:bg-[var(--vr-surface-2)] md:p-5',focus?'bg-[var(--vr-surface-2)]/50':'',n.nivel===5?'col-span-2 md:col-span-1':'',active===n.nivel?'ring-2 ring-inset ring-foreground':'')}>
      <div className="flex w-full items-center justify-between gap-2"><span className="vr-data text-[12px] font-semibold text-text-3">0{n.nivel} / 05</span>{focus&&<span className="rounded-[3px] bg-foreground px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-background">Foco Velora</span>}</div>
      <div className="mt-5 flex items-end gap-2"><span className="vr-data text-[38px] leading-none tracking-[-.08em] font-semibold" style={{color:focus?'var(--vr-text)':'var(--vr-text-2)'}}>{n.nivel>=4?'—':fmt(count)}</span><span className="pb-1 text-[11px] text-text-3">{n.nivel>=4?'não aferível':'contas'}</span></div>
      <div className="mt-auto pt-4"><div className="mb-2 h-[3px] w-full bg-[var(--vr-surface-3)]"><div style={{width:n.nivel>=4?'0%':String(percent(count,analises.length))+'%',backgroundColor:n.cor}} className="h-full transition-[width] duration-300"/></div><div className="text-[13px] font-semibold leading-5">{n.titulo}</div><p className="mt-0.5 text-[11px] text-text-3">{n.sub}</p></div>
     </button>})}
  </div>
  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-[var(--vr-surface-2)] px-5 py-3 text-xs text-text-3">
   <span><strong className="text-foreground">{counts[0]}</strong> contas sem evidências suficientes para classificação</span>
   <button onClick={()=>onPick(0)} className="font-semibold text-text-2 underline decoration-border-strong underline-offset-4 hover:text-foreground">Ver inconclusivas</button>
  </div>
 </section>;
}
function hashId(value:string){let h=0;for(let i=0;i<value.length;i++)h=((h*31)+value.charCodeAt(i))|0;return h>>>0;}
function Mapa({rows,onSelect}:{rows:AnaliseAquisicao[];onSelect:(a:AnaliseAquisicao)=>void}){
 const [hover,setHover]=useState<string|null>(null);
 const sorted=[...rows].sort((a,b)=>Number(a.foco)-Number(b.foco));
 const active=sorted.find(x=>x.conta.id===hover);
 const width=850,height=395,x0=62,x1=814,y0=345,y1=30;
 const pos=(a:AnaliseAquisicao)=>{
   const h=hashId(a.conta.id);const jx=((h%19)-9)*.47,jy=(((h>>>7)%19)-9)*.44;
   return {x:x0+a.x/100*(x1-x0)+jx,y:y0-a.y/100*(y0-y1)+jy};
 };
 const point=active?pos(active):null;
 return <section className={cn(secao,'min-w-0 overflow-hidden')}>
  <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 md:px-6 md:pt-6"><div><LabelCaps>Mapa de capacidades</LabelCaps><h2 className="mt-1 text-lg font-semibold tracking-tight">Onde estão as oportunidades</h2><p className="mt-1 max-w-xl text-xs leading-5 text-text-3">Cada ponto é uma empresa. Eixos mostram <strong className="text-text-2">capacidades técnicas observadas</strong>, não performance.</p></div><span className="vr-data rounded-control border border-border px-2 py-1 text-[11px] text-text-3">{rows.length} contas</span></div>
  <div className="relative px-2 pb-2 pt-3 md:px-4">
   <svg viewBox="0 0 850 395" className="h-auto w-full overflow-visible" role="img" aria-label="Dispersão de empresas por instrumentação observada e ativação comercial observada">
    <defs>
     <pattern id="atlas-grid" width="75.2" height="31.5" patternUnits="userSpaceOnUse"><path d="M75.2 0H0V31.5" fill="none" stroke="var(--vr-border)" strokeWidth=".8" opacity=".8"/></pattern>
    </defs>
    <rect x={x0} y={y1} width={x1-x0} height={y0-y1} fill="url(#atlas-grid)" rx="3"/>
    <rect x={x0+(.34)*(x1-x0)} y={y1+(.10)*(y0-y1)} width={(x1-x0)*.42} height={(y0-y1)*.78} fill="var(--vr-ok-bg)" opacity=".24" stroke="var(--vr-ok)" strokeDasharray="5 5" strokeOpacity=".25"/>
    {[0,25,50,75,100].map(v=><g key={v}><text x={x0+v/100*(x1-x0)} y={y0+22} fontSize="11" textAnchor="middle" fill="var(--vr-text-3)">{v}</text><text x={x0-14} y={y0-v/100*(y0-y1)+4} fontSize="11" textAnchor="end" fill="var(--vr-text-3)">{v}</text></g>)}
    <text x={x0+15} y={y1+24} fontSize="11" fontWeight="600" fill="var(--vr-text-3)" opacity=".75">MENOS EVIDÊNCIA WEB OBSERVADA</text>
    <text x={x1-15} y={y1+24} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--vr-text-3)" opacity=".75">STACK MAIS OBSERVÁVEL</text>
    <text x={(x0+x1)/2} y="390" fontSize="12" textAnchor="middle" fill="var(--vr-text-2)">Instrumentação & eventos observáveis →</text>
    <text x="16" y={(y0+y1)/2} transform={'rotate(-90 16 '+(y0+y1)/2+')'} fontSize="12" textAnchor="middle" fill="var(--vr-text-2)">Ativação de mídia, captura & CRM web →</text>
    {sorted.map(a=>{const p=pos(a);const c=corNivel(a.nivel);const selected=hover===a.conta.id;return <g key={a.conta.id} onMouseEnter={()=>setHover(a.conta.id)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(a.conta.id)} onBlur={()=>setHover(null)} onClick={()=>onSelect(a)} onKeyDown={e=>{if(e.key==='Enter')onSelect(a)}} role="button" tabIndex={0} aria-label={a.conta.name+', maturidade '+a.nivel} className="cursor-pointer">
      {selected&&<circle cx={p.x} cy={p.y} r="12" fill={c} opacity=".15"/>}
      <circle cx={p.x} cy={p.y} r={selected?6.9:a.foco?5.1:3.8} fill={a.nivel===0?'var(--vr-border-strong)':c} fillOpacity={selected ? 1 : (a.foco ? 0.85 : 0.55)} stroke={selected?'var(--vr-text)':'var(--vr-surface)'} strokeWidth={selected?1.6:0.85}/>
     </g>})}
    {point&&active&&<g style={{pointerEvents:'none'}} transform={'translate('+(Math.min(point.x,630))+','+(Math.max(point.y-62,8))+')'}>
      <rect x="10" y="0" width="212" height="58" rx="6" fill="var(--vr-text)"/>
      <text x="20" y="20" fontSize="12" fontWeight="700" fill="var(--vr-bg)">{active.conta.name.slice(0,31)}</text>
      <text x="20" y="40" fontSize="11" fill="var(--vr-bg)" opacity=".85">{active.nivel?'L'+active.nivel+' · '+NIVEL_LABEL[active.nivel]:'Sem classificação'}</text>
     </g>}
   </svg>
  </div>
  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-[var(--vr-surface-2)] px-5 py-3">{[1,2,3].map(n=><span key={n} className="flex items-center gap-2 text-[11px] text-text-2"><span className="size-2.5 rounded-full" style={{background:corNivel(n)}}/>L{n} {NIVEL_LABEL[n]}</span>)}<span className="ml-auto text-[11px] text-text-3">Clique em um ponto para investigar</span></div>
 </section>;
}
const DIMENSOES=[
 {key:'medicao',nome:'Mensuração',peso:'GTM · GA4'},
 {key:'midia',nome:'Mídia',peso:'Ads · Meta · LinkedIn'},
 {key:'captacao',nome:'Captação',peso:'Formulário · WhatsApp'},
 {key:'orquestracao',nome:'Orquestração',peso:'CRM/automação web'},
 {key:'eventos',nome:'Eventos',peso:'Clique · conversão'}
] as const;
function MapaCalor({rows}:{rows:AnaliseAquisicao[]}){
 return <section className={cn(secao,'min-w-0 overflow-hidden')}>
  <div className="px-5 pt-5 md:px-6 md:pt-6"><LabelCaps>Leitura por capacidade</LabelCaps><h2 className="mt-1 text-lg font-semibold tracking-tight">Perfil do stack por estágio</h2><p className="mt-1 text-xs text-text-3">Média dos sinais positivos observados por dimensão e estágio.</p></div>
  <div className="overflow-x-auto px-5 pb-5 pt-5 md:px-6"><table className="w-full min-w-[470px] border-separate text-left" style={{borderSpacing:'5px 7px'}}>
   <thead><tr><th className="w-[120px] pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-3">Estágio</th>{DIMENSOES.map(d=><th key={d.key} className="pb-2 text-center text-[10px] font-semibold text-text-3">{d.nome}</th>)}</tr></thead>
   <tbody>{NIVEIS.map(n=>{const subset=rows.filter(r=>r.nivel===n.nivel);return <tr key={n.nivel}><th className="whitespace-nowrap text-[12px] font-semibold text-text-2">L{n.nivel} <span className="vr-data text-[10px] font-normal text-text-3">({n.nivel>3?'n/v':subset.length})</span></th>
    {DIMENSOES.map(d=>{const sample=subset.map(x=>x.dimensoes[d.key]).filter((v):v is number=>v!==null);
      const v=sample.length?sample.reduce((a,b)=>a+b,0)/sample.length:null;
      return <td key={d.key} title={d.nome+': '+(v===null?'não aferível':Math.round(v)+'% de capacidade observada')} className="p-0">
       <div className="vr-data grid h-10 place-items-center rounded-[4px] text-[11px] font-medium" style={v===null?{background:'var(--vr-surface-2)',color:'var(--vr-text-3)'}:{background:'color-mix(in srgb, var(--vr-ok) '+Math.round(Math.max(5,v*.50))+'%, var(--vr-surface) )',color:v>68?'var(--vr-text-inverse)':'var(--vr-text-2)'}}>{v===null?'—':Math.round(v)}</div>
      </td>})}</tr>})}</tbody>
  </table>
  <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-text-3">0 a 100 = intensidade de <strong>evidências web positivas</strong>, não índice de performance.</span><span className="text-[11px] text-text-3">n/v = não verificável publicamente</span></div></div>
  <div className="mx-5 mb-5 rounded-control border-l-[3px] border-warm bg-warm-bg p-3 text-[11px] leading-5 text-text-2 md:mx-6"><strong>Leitura estratégica:</strong> o salto de L2 para L3 indica mais ferramentas observáveis. O salto para L4 depende de acesso ao fluxo real de leads, campanhas e receita.</div>
 </section>;
}
function Exportar({rows}:{rows:AnaliseAquisicao[]}){
 const exportar=()=>{
  const cab=['ID','Empresa','Domínio','Tier','Maturidade estimada','Cobertura','Prioridade foco','Mensuração','Mídia','Captação','CRM Web','Evento','Hipótese'];
  const csv=[cab.join(';'),...rows.map(a=>[
   a.conta.id,a.conta.name,a.conta.domain,a.conta.tier,a.nivel||'Não aferido',a.confianca,pontuacaoFoco(a),
   a.dimensoes.medicao,a.dimensoes.midia,a.dimensoes.captacao,a.dimensoes.orquestracao,a.dimensoes.eventos??'N/A',a.hipotese
  ].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';'))].join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const el=document.createElement('a');el.href=url;el.download='velora-maturidade-aquisicao.csv';el.click();setTimeout(()=>URL.revokeObjectURL(url),800);
 };
 return <button onClick={exportar} type="button" className="inline-flex h-9 items-center gap-2 rounded-control border border-border bg-card px-3 text-[12px] font-semibold text-text-2 hover:border-border-strong hover:text-foreground"><Download className="size-3.5"/>Exportar</button>;
}
function ListaFoco({rows,onSelect}:{rows:AnaliseAquisicao[];onSelect:(a:AnaliseAquisicao)=>void}){
 const matches=rows.filter(a=>a.foco).sort((a,b)=>pontuacaoFoco(b)-pontuacaoFoco(a));
 return <section className={cn(secao,'min-w-0 overflow-hidden')}>
  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-5 md:px-6"><div><LabelCaps>Shortlist Velora</LabelCaps><h2 className="mt-1 text-lg font-semibold tracking-tight">Empresas no sweet spot</h2><p className="mt-1 text-xs text-text-3">L2/L3 com evidência pública · ranqueamento por fit, sinais e cobertura.</p></div><span className="vr-data rounded-control border border-border px-2 py-1 text-[11px]">{matches.length} contas</span></div>
  <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-xs"><thead className="bg-[var(--vr-surface-2)] text-[10px] uppercase tracking-wider text-text-3"><tr><th className="px-5 py-3 font-semibold md:px-6">Empresa</th><th className="px-3 py-3 font-semibold">Estágio</th><th className="px-3 py-3 font-semibold">Capacidades</th><th className="px-3 py-3 font-semibold">Hipótese de oportunidade</th><th className="px-3 py-3 text-right font-semibold">Ajuste ABM</th><th className="w-7"/></tr></thead>
  <tbody>{matches.slice(0,18).map(a=><tr key={a.conta.id} onClick={()=>onSelect(a)} onKeyDown={e=>{if(e.key==='Enter')onSelect(a)}} tabIndex={0} className="group cursor-pointer border-b border-border/80 transition-colors hover:bg-[var(--vr-surface-2)] focus:bg-[var(--vr-surface-2)]">
    <td className="min-w-[170px] px-5 py-3 md:px-6"><div className="font-semibold text-foreground">{a.conta.name}</div><div className="vr-data mt-1 text-[10px] text-text-3">{a.conta.id} · Tier {a.conta.tier}</div></td>
    <td className="px-3 py-3"><SeloNivel nivel={a.nivel}/><div className="mt-2"><SeloConfianca estado={a.confianca}/></div></td>
    <td className="px-3 py-3"><div className="flex gap-1">{(['medicao','midia','captacao','orquestracao'] as const).map(k=><span key={k} title={k+': '+a.dimensoes[k]} className="h-7 w-2.5 rounded-[2px]" style={{background:a.dimensoes[k]?'color-mix(in srgb, var(--vr-ok) '+Math.max(25,a.dimensoes[k]*.70)+'%, var(--vr-surface-3))':'var(--vr-surface-3)'}}/>)}</div></td>
    <td className="max-w-[280px] px-3 py-3 text-[11px] leading-5 text-text-2">{delta(a)}</td>
    <td className="vr-data px-3 py-3 text-right font-semibold">{pontuacaoFoco(a)}</td><td className="px-2"><ChevronRight className="size-4 text-text-3"/></td>
   </tr>)}</tbody></table>{!matches.length&&<div className="p-8 text-center text-sm text-text-3">Nenhuma conta L2/L3 corresponde aos filtros atuais.</div>}</div>
  <div className="border-t border-border bg-[var(--vr-surface-2)] px-5 py-3 text-[11px] leading-5 text-text-3">Ajuste ABM = combinação de fit Tier, cobertura de evidência e famílias de sinais. Não mede fragilidade ou receita potencial.</div>
 </section>;
}
function Detalhe({a,onClose}:{a:AnaliseAquisicao;onClose:()=>void}){
 const c=a.conta;const nivel=NIVEIS.find(n=>n.nivel===a.nivel);
 return <div className="fixed inset-0 z-50 bg-black/35" onMouseDown={onClose}><aside role="dialog" aria-modal="true" aria-label={'Maturidade de '+c.name} onMouseDown={e=>e.stopPropagation()} className="ml-auto h-full w-full max-w-[590px] overflow-y-auto border-l border-border bg-background shadow-3">
  <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background px-6 py-5"><div><LabelCaps>Diagnóstico exploratório · {c.id}</LabelCaps><h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">{c.name}</h2><p className="mt-1 text-xs text-text-3">{c.domain} · Tier {c.tier}</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-control border border-border p-2 hover:bg-[var(--vr-surface-2)]"><X className="size-4"/></button></div>
  <div className="space-y-5 p-6">
   <div className="flex flex-wrap gap-2"><SeloNivel nivel={a.nivel}/><SeloConfianca estado={a.confianca}/><span className="vr-data rounded-chip border border-border px-2 py-1 text-[11px]">Prioridade {pontuacaoFoco(a)}</span>{c.sourceCohort&&<span className="rounded-chip border border-ok/30 bg-ok-bg px-2 py-1 text-[11px] font-semibold text-ok">NOVA L12</span>}</div>
   {c.sourceCohort&&<div className="rounded-control border border-warm/30 bg-warm-bg px-3 py-3 text-[11px] leading-5 text-text-2"><strong>Conta em pesquisa:</strong> {c.sector||"Segmento a confirmar"}{c.region?" · "+c.region:""}. ICP, faturamento e decisores não validados; não liberar automaticamente para cadência comercial.</div>}
   <div className="rounded-card border border-border bg-card p-5"><LabelCaps>Posicionamento estimado</LabelCaps><h3 className="mt-1 text-lg font-semibold">{nivel?.titulo||'Evidência insuficiente'}</h3><p className="mt-2 text-sm leading-6 text-text-2">{nivel?.descricao||'Não foi possível determinar o estágio a partir das páginas e tecnologias públicas auditadas.'}</p></div>
   <div className="rounded-card border border-border bg-card p-5"><LabelCaps>Perfil de capacidades</LabelCaps><div className="mt-4 space-y-4">{DIMENSOES.map(d=>{const v=a.dimensoes[d.key];return <div key={d.key}><div className="mb-1.5 flex justify-between gap-2 text-xs"><span className="font-medium">{d.nome}</span><span className="vr-data text-text-3">{v===null?'Não testado':v+'/100'}</span></div><div className="h-2 w-full overflow-hidden rounded-[3px] bg-[var(--vr-surface-3)]"><div className="h-full bg-foreground transition-[width]" style={{width:v===null?'0%':v+'%'}}/></div><p className="mt-1 text-[11px] text-text-3">{d.peso}</p></div>})}</div><p className="mt-4 border-t border-border pt-3 text-[11px] text-text-3">Pontuações medem presença de evidência; não comprovam eficiência.</p></div>
   <div className="rounded-card border border-border bg-card p-5"><LabelCaps>Achados técnicos positivos</LabelCaps><div className="mt-3 flex flex-wrap gap-2">{a.indicios.map(t=><span key={t} className="rounded-[4px] border border-border bg-[var(--vr-surface-2)] px-2.5 py-1.5 text-[11px] text-text-2">{t}</span>)}{!a.indicios.length&&<span className="text-sm text-text-3">Nenhuma evidência suficiente nas páginas testadas.</span>}</div>
   <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4"><div><LabelCaps>Formulários DOM</LabelCaps><p className="vr-data mt-1 text-xl font-semibold">{c.forms}</p></div><div><LabelCaps>Links WhatsApp DOM</LabelCaps><p className="vr-data mt-1 text-xl font-semibold">{c.whatsappLinks}</p></div></div></div>
   {!!c.historicalTech?.length&&<div className="rounded-card border border-border bg-card p-5"><LabelCaps>Histórico de tecnologias · provedor</LabelCaps><p className="mt-1 text-[11px] text-text-3">Inventário histórico Clay/BuiltWith. Não indica instalação ativa e não entra no nível de maturidade.</p><div className="mt-3 flex flex-wrap gap-1.5">{c.historicalTech.slice(0,14).map((t,i)=><span key={t+i} className="rounded-[3px] border border-border px-2 py-1 text-[11px] text-text-2">{t}</span>)}</div></div>}
   <div className="rounded-card border-l-4 border-l-foreground bg-[var(--vr-surface-2)] p-5"><LabelCaps>Hipótese de Growth para validar</LabelCaps><p className="mt-2 text-sm font-semibold leading-6">{a.hipotese}</p><p className="mt-3 text-[12px] leading-5 text-text-2"><strong>Próximo teste:</strong> {a.proximoTeste}</p></div>
   <div className="flex flex-wrap gap-2">
    <a href={'https://'+c.domain} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-2 rounded-control border border-border bg-card px-3 py-2 text-[12px] font-semibold hover:bg-[var(--vr-surface-2)]"><ExternalLink className="size-3.5"/> Site</a>
    {c.evidence.startsWith('https://github.com/')&&<a href={c.evidence} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-2 rounded-control border border-border bg-card px-3 py-2 text-[12px] font-semibold hover:bg-[var(--vr-surface-2)]"><Fingerprint className="size-3.5"/> Fonte do scanner</a>}
    <Link href={'/aquisicao/stack'} className="inline-flex items-center gap-2 rounded-control bg-foreground px-3 py-2 text-[12px] font-semibold text-background"><Layers3 className="size-3.5"/> Explorar stack detalhado</Link>
   </div>
  </div>
 </aside></div>;
}
export function TelaMaturidade({base,dados}:{base:Base;dados:DadosAquisicao}){
 const todas=useMemo(()=>analisarBase(dados.accounts),[dados]);
 const [busca,setBusca]=useState('');const [tier,setTier]=useState('todos');
 const [nivel,setNivel]=useState(-1);const [confidence,setConfidence]=useState('todos');
 const [selected,setSelected]=useState<AnaliseAquisicao|null>(null);const [focusOnly,setFocusOnly]=useState(false);const [onlyNew,setOnlyNew]=useState(false);
 const rows=useMemo(()=>todas.filter(a=>{
   const match=!busca||[a.conta.name,a.conta.domain,a.conta.id].join(' ').toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR'));
   return match&&(tier==='todos'||a.conta.tier===tier)&&(nivel===-1||a.nivel===nivel)&&
    (confidence==='todos'||a.confianca===confidence)&&(!focusOnly||a.foco)&&(!onlyNew||!!a.conta.sourceCohort);
  }),[todas,busca,tier,nivel,confidence,focusOnly,onlyNew]);
 const total=contagemNiveis(todas),foco=total[2]+total[3],conclusivos=todas.filter(x=>x.nivel>0).length;
 const targetRows=rows.filter(a=>a.foco);
 const novos=todas.filter(x=>!!x.conta.sourceCohort);const novasFoco=novos.filter(x=>x.foco).length;
 const activeFilters=busca||tier!=='todos'||nivel!==-1||confidence!=='todos'||focusOnly||onlyNew;
 return <Casca base={base}>
  <main className="mx-auto w-full max-w-[1560px] px-4 pb-28 pt-4 md:px-8 md:pb-16 md:pt-8">
   <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div><div className="mb-2 flex items-center gap-2"><span className="size-[7px] rounded-full bg-ok"/><LabelCaps>Velora intelligence · Acquisition maturity</LabelCaps></div>
     <h1 className="font-display text-[32px] font-semibold tracking-[-.045em] md:text-[38px]">Maturidade de aquisição<span className="text-text-3">.</span></h1>
     <p className="mt-2 max-w-2xl text-[13px] leading-6 text-text-2">Onde existe capacidade instalada, mas ainda há espaço para transformar aquisição em crescimento previsível.</p></div>
    <div className="flex flex-wrap items-center gap-2"><span className="vr-data rounded-control border border-border bg-card px-2.5 py-2 text-[11px] text-text-3">Evidências · 08 NOV 2026</span><span className="vr-data rounded-control border border-ok/35 bg-ok-bg px-2.5 py-2 text-[11px] font-semibold text-ok">+{novos.length} contas L12</span><Link href="/aquisicao/stack" className="inline-flex h-9 items-center gap-2 rounded-control border border-border bg-card px-3 text-xs font-semibold hover:bg-[var(--vr-surface-2)]"><Layers3 className="size-3.5"/> Stack detalhado <ArrowUpRight className="size-3"/></Link></div>
   </header>
   <section className="relative mb-4 overflow-hidden rounded-[10px] bg-[#1e2928] px-5 py-6 text-white md:px-7 md:py-7">
    <div aria-hidden className="pointer-events-none absolute -right-20 -top-52 size-[440px] rounded-full border border-white/10"/><div aria-hidden className="pointer-events-none absolute -right-4 -top-32 size-[320px] rounded-full border border-white/10"/>
    <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
     <div className="max-w-[640px]"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-white/55">O sweet spot da Velora · L2 + L3</p>
      <div className="flex items-end gap-4"><strong className="vr-data text-[64px] font-semibold leading-none tracking-[-.08em] md:text-[76px]">{fmt(foco)}</strong><div className="pb-2"><span className="block text-sm font-semibold">contas com potencial de transformação</span><span className="mt-1 block text-xs text-white/60">{percent(foco,conclusivos)}% das contas classificáveis</span></div></div>
      <p className="mb-0 mt-4 max-w-[580px] text-[12px] leading-6 text-white/70">Empresas com alguma capacidade de mensuração, mídia e/ou automação no site — sem certificação de integração com receita. Aqui a Velora pode investigar oportunidades de escalar.</p>
     </div>
     <div className="grid min-w-[210px] grid-cols-2 gap-3 sm:min-w-[300px]">
      <button onClick={()=>{setNivel(nivel===2?-1:2);setFocusOnly(false)}} className="rounded-[6px] border border-white/15 bg-white/[.06] p-3 text-left transition-colors hover:bg-white/10"><span className="block text-[10px] uppercase tracking-wide text-white/55">L2 · Emergente</span><span className="vr-data mt-1 block text-3xl font-semibold">{total[2]}</span><span className="mt-2 block h-[3px] w-10 rounded-full bg-[#d6ac85]"/></button>
      <button onClick={()=>{setNivel(nivel===3?-1:3);setFocusOnly(false)}} className="rounded-[6px] border border-white/15 bg-white/[.06] p-3 text-left transition-colors hover:bg-white/10"><span className="block text-[10px] uppercase tracking-wide text-white/55">L3 · Estruturada</span><span className="vr-data mt-1 block text-3xl font-semibold">{total[3]}</span><span className="mt-2 block h-[3px] w-10 rounded-full bg-[#9ebaa1]"/></button>
     </div>
    </div>
   </section>
   <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
    <Metric label="Base monitorada" numero={fmt(todas.length)} desc="contas com inventário tecnológico" icon={Compass}/>
    <Metric label="Auditoria web" numero={fmt(todas.filter(a=>a.conta.validPages>0).length)} desc="sites efetivamente inspecionados" icon={Fingerprint}/>
    <Metric label="Faixa L2 + L3" numero={fmt(foco)} desc="alvo estratégico para diagnóstico" icon={Target}/>
    <Metric label="Evidência insuficiente" numero={fmt(total[0])} desc="não entram como baixa maturidade" icon={ShieldAlert}/>
   </div>
   <div className="mb-3 rounded-[8px] border border-ok/25 bg-ok-bg px-4 py-3 text-xs text-text-2"><strong className="text-ok">Expansão L12:</strong> {novos.length} novas contas de TI, {novos.filter(x=>x.conta.validPages>0).length} sites auditados e <strong>{novasFoco} novas contas L2/L3</strong>. Todas seguem em pesquisa; faturamento, ICP e decisores precisam de validação antes da abordagem. <button className="ml-2 font-semibold text-ok underline underline-offset-2" onClick={()=>{setOnlyNew(true);setNivel(-1);setFocusOnly(false)}}>Ver novas contas</button></div>
   <Progressao analises={todas} active={nivel} onPick={x=>{setNivel(x);setFocusOnly(false)}}/>
   <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[8px] border border-border bg-card px-3 py-3">
    <SlidersHorizontal className="ml-1 size-4 text-text-3"/><div className="relative min-w-[180px] flex-1 md:max-w-[320px]"><Search className="absolute left-3 top-2.5 size-3.5 text-text-3"/><input value={busca} onChange={e=>setBusca(e.target.value)} className="h-9 w-full rounded-control border border-border-strong bg-background py-1.5 pl-9 pr-3 text-[12px] outline-none" placeholder="Buscar empresa ou domínio" aria-label="Buscar empresa ou domínio"/></div>
    <select value={tier} onChange={e=>setTier(e.target.value)} aria-label="Filtrar Tier" className="h-9 rounded-control border border-border-strong bg-background px-3 text-[12px]"><option value="todos">Todos os tiers</option><option value="A">Tier A</option><option value="B">Tier B</option><option value="C">Tier C</option></select>
    <select value={nivel} onChange={e=>{setNivel(Number(e.target.value));setFocusOnly(false)}} aria-label="Filtrar estágio" className="h-9 rounded-control border border-border-strong bg-background px-3 text-[12px]"><option value={-1}>Todos os estágios</option><option value={0}>Inconclusivas</option>{NIVEIS.map(n=><option key={n.nivel} value={n.nivel}>L{n.nivel} · {n.titulo}</option>)}</select>
    <select value={confidence} onChange={e=>setConfidence(e.target.value)} aria-label="Filtrar cobertura" className="h-9 rounded-control border border-border-strong bg-background px-3 text-[12px]"><option value="todos">Toda cobertura</option><option value="adequada">Adequada</option><option value="parcial">Parcial</option><option value="insuficiente">Insuficiente</option></select>
    <button type="button" onClick={()=>{setFocusOnly(!focusOnly);setNivel(-1)}} className={cn('inline-flex h-9 items-center gap-2 rounded-control border px-3 text-[12px] font-semibold',focusOnly?'border-foreground bg-foreground text-background':'border-border bg-card text-text-2')}><Target className="size-3.5"/>Só foco L2/L3</button>
    <button type="button" onClick={()=>setOnlyNew(!onlyNew)} className={cn("inline-flex h-9 items-center gap-2 rounded-control border px-3 text-[12px] font-semibold",onlyNew?"border-foreground bg-foreground text-background":"border-border bg-card text-text-2")}>Novas L12 ({novos.length})</button>
    <Exportar rows={rows}/>
    {activeFilters&&<button onClick={()=>{setBusca('');setTier('todos');setNivel(-1);setConfidence('todos');setFocusOnly(false);setOnlyNew(false)}} className="px-2 text-xs font-medium text-text-3 hover:text-foreground">Limpar</button>}
    <span className="vr-data ml-auto text-[11px] text-text-3">{rows.length} contas</span>
   </div>
   <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_.8fr]"><Mapa rows={rows} onSelect={setSelected}/><MapaCalor rows={rows}/></div>
   <div className="mt-4"><ListaFoco rows={rows} onSelect={setSelected}/></div>
   <div className="mt-4 flex items-start gap-3 rounded-[8px] border border-border bg-[var(--vr-surface-2)] px-4 py-4 text-[11px] leading-5 text-text-3"><ShieldAlert className="mt-0.5 size-4 shrink-0"/><div><strong className="text-text-2">Limite da pesquisa:</strong> este modelo classifica sinais técnicos publicamente observáveis, não a maturidade operacional certificada. L4 e L5 exigem evidência interna. “Não observado” não significa ausência. Pixels não comprovam campanhas ativas, e scripts web não comprovam CRM integrado. <Link className="ml-1 underline underline-offset-2" href="/aquisicao/stack">Ver os dados brutos</Link>.</div></div>
  </main>
  {selected&&<Detalhe a={selected} onClose={()=>setSelected(null)}/>}
 </Casca>;
}
