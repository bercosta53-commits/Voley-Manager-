'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
 Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Check, ChevronRight,
 Compass, Download, ExternalLink, Eye, Fingerprint, Layers3, Search, ShieldAlert, SlidersHorizontal, Target, X
} from 'lucide-react';
import { Casca } from '@/components/casca/casca';
import type { BaseCasca } from '@/lib/casca-dados';
import {
 analisarBase, contagemNiveis, pontuacaoFoco, NIVEIS, GRUPO_TRACKING, GRUPO_MIDIA, GRUPO_CRM,
 NOMES_TECNOLOGIAS, quantidade, type AnaliseAquisicao, type Confianca, type DadosAquisicao, type NivelMaturidade
} from '@/lib/aquisicao-maturidade';
import { cn } from '@/lib/utils';

const fmt=(n:number)=>n.toLocaleString('pt-BR');
const percent=(n:number,d:number)=>d?Math.round(100*n/d):0;
const NIVEL_LABEL:Record<number,string>={0:'Sem classificação',1:'Presença inicial',2:'Aquisição emergente',3:'Operação estruturada',4:'Integrada por dados',5:'Otimização contínua'};
const corNivel=(n:number)=>NIVEIS.find(x=>x.nivel===n)?.cor||'var(--vr-border-strong)';
const secao='rounded-card border border-border bg-card shadow-1';
function delta(a:AnaliseAquisicao) { return a.nivel===2?'Potencial de estruturar aquisição e conexão com vendas':a.nivel===3?'Potencial de integrar canais, dados e receita':a.hipotese; }
function LabelCaps({children}:{children:React.ReactNode}){return <span className="text-xs font-semibold uppercase tracking-[.15em] text-text-3">{children}</span>;}
function SeloNivel({nivel,escuro=false}:{nivel:NivelMaturidade;escuro?:boolean}){
 const c=corNivel(nivel);
 return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-control border px-2 py-1 text-xs font-semibold',escuro?'border-white/20 bg-white/10 text-white':'border-border bg-[var(--vr-surface-2)] text-foreground')}>
   <span className="size-[7px] rounded-[2px]" style={{backgroundColor:c}}/>{nivel===0?'Não classificada':'L'+nivel}
 </span>;
}
function SeloConfianca({estado}:{estado:Confianca}) {
 const m={adequada:'Cobertura web adequada',parcial:'Cobertura parcial',insuficiente:'Evidência insuficiente'};
 return <span className="inline-flex items-center gap-1 text-xs text-text-3"><span className={cn('size-1.5 rounded-full',estado==='adequada'?'bg-ok':estado==='parcial'?'bg-warm':'bg-border-strong')}/>{m[estado]}</span>;
}
function ReguaMaturidade({analises,ativo,onPick}:{analises:AnaliseAquisicao[];ativo:number;onPick:(n:number)=>void}){
 const c=contagemNiveis(analises);const total=analises.length||1;const foco=c[2]+c[3];
 const faixas=[{nivel:0,curto:'?',titulo:'Inconclusiva',cor:'var(--vr-border)'},...NIVEIS.map(n=>({nivel:n.nivel,curto:n.curto,titulo:n.titulo,cor:n.cor}))];
 return <section className={cn(secao,'mb-4 p-5 md:p-6')} aria-labelledby="regua-t">
  <div className="flex flex-wrap items-end justify-between gap-4">
   <div><LabelCaps>Quão avançada é a aquisição da base</LabelCaps>
    <h2 id="regua-t" className="mt-1 text-lg font-semibold tracking-tight">
     <span className="vr-data text-3xl font-semibold">{fmt(foco)}</span> de {fmt(analises.length)} contas no sweet spot da Velora <span className="text-text-3">({percent(foco,analises.length)}%)</span>
    </h2>
    <p className="mt-1 max-w-2xl text-xs text-text-3">L2 e L3 já têm canais e instrumentação, mas sem operação integrada com receita: é onde a Velora transforma aquisição em crescimento previsível.</p></div>
  </div>
  {/* barra única: largura = contas no nível; colchete sobre L2 + L3 */}
  <div className="relative mt-7">
   <div className="flex h-12 w-full overflow-hidden rounded-control">
    {faixas.filter(f=>c[f.nivel as NivelMaturidade]>0).map(f=>{const n=c[f.nivel as NivelMaturidade];const sweet=f.nivel===2||f.nivel===3;return <button key={f.nivel} type="button" onClick={()=>onPick(ativo===f.nivel?-1:f.nivel)} aria-pressed={ativo===f.nivel} title={`${f.curto} · ${f.titulo}: ${n} contas`}
     className={cn('relative flex min-w-[44px] flex-col justify-center px-2 text-left transition-[filter] hover:brightness-95',ativo===f.nivel&&'ring-2 ring-inset ring-foreground')}
     style={{width:`${100*n/total}%`,background:f.cor,opacity:sweet?1:.55}}>
     <span className={cn('vr-data text-sm font-semibold',f.nivel<=1?'text-foreground':'text-white')}>{n}</span>
    </button>;})}
   </div>
   {foco>0&&(()=>{const antes=c[0]+c[1];return <div aria-hidden className="pointer-events-none absolute -top-5 flex flex-col items-center" style={{left:`${100*antes/total}%`,width:`${100*foco/total}%`}}>
    <span className="rounded-chip bg-foreground px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-background">Sweet spot Velora · L2 + L3</span>
   </div>;})()}
  </div>
  <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
   {faixas.map(f=>{const n=c[f.nivel as NivelMaturidade];const sweet=f.nivel===2||f.nivel===3;return <li key={f.nivel} className={cn('flex items-start gap-2 rounded-control px-2 py-1.5',sweet&&'bg-[var(--vr-surface-2)]')}>
    <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-[2px]" style={{background:f.cor,opacity:sweet?1:.55}}/>
    <span className="min-w-0"><span className="block text-xs font-semibold">{f.curto==='?'?'Inconclusiva':`${f.curto} · ${f.titulo}`}</span><span className="vr-data text-xs text-text-3">{n} contas</span>{f.nivel>=4&&n===0&&<span className="block text-xs text-text-3">exige validação interna</span>}</span>
   </li>;})}
  </ol>
 </section>;
}

/** Medidor de 5 casas: preenchido até o nível da empresa; as casas L2 e L3 têm a faixa do sweet spot. */
function Medidor({nivel}:{nivel:number}){
 return <span className="inline-flex items-center gap-1.5" aria-label={nivel?`Maturidade L${nivel} de 5`:'Maturidade não aferida'}>
  <span className="relative flex gap-0.5 rounded-[3px] p-0.5">
   <span aria-hidden className="absolute inset-y-0 rounded-[3px] bg-ok-bg" style={{left:'calc(20% - 1px)',width:'calc(40% + 2px)'}}/>
   {[1,2,3,4,5].map(i=><span key={i} className="relative h-3 w-4 rounded-[2px]" style={{background:i<=nivel?corNivel(nivel):'var(--vr-surface-3)'}}/>)}
  </span>
  <span className="vr-data text-xs font-semibold">{nivel?`L${nivel}`:'—'}</span>
 </span>;
}

/** Capacidade observada (0–100) em barra curta com rótulo. */
function Capacidade({nome,v}:{nome:string;v:number|null}){
 return <span className="flex min-w-0 flex-col gap-1" title={`${nome}: ${v===null?'não aferível':Math.round(v)+'% de evidência observada'}`}>
  <span className="truncate text-xs text-text-3">{nome}</span>
  <span className="h-1.5 w-full rounded-full bg-[var(--vr-surface-3)]"><span className="block h-full rounded-full bg-ok" style={{width:`${v??0}%`,opacity:v===null?0:.35+.65*(v/100)}}/></span>
 </span>;
}

/** Onde cada empresa está: medidor de maturidade, capacidades observadas, hipótese e atratividade. */
function ListaMaturidade({rows,onSelect,soFoco,onSoFoco}:{rows:AnaliseAquisicao[];onSelect:(a:AnaliseAquisicao)=>void;soFoco:boolean;onSoFoco:(v:boolean)=>void}){
 const [limite,setLimite]=useState(25);
 const lista=(soFoco?rows.filter(a=>a.foco):rows).slice().sort((a,b)=>Number(b.foco)-Number(a.foco)||pontuacaoFoco(b)-pontuacaoFoco(a));
 return <section className={cn(secao,'min-w-0 overflow-hidden')}>
  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 md:px-6">
   <div><LabelCaps>Onde cada empresa está</LabelCaps><h2 className="mt-1 text-lg font-semibold tracking-tight">{soFoco?'Empresas no sweet spot':'Todas as empresas'}</h2><p className="mt-1 text-xs text-text-3">Medidor de L1 a L5 (faixa verde = sweet spot) e capacidades observadas no site. Ordenadas por atratividade.</p></div>
   <div role="radiogroup" aria-label="Quais empresas" className="flex rounded-control border border-border bg-card p-0.5 text-xs">
    {[[true,'Sweet spot'],[false,'Todas']].map(([v,r])=><button key={String(v)} role="radio" aria-checked={soFoco===v} onClick={()=>{onSoFoco(v as boolean);setLimite(25)}} className={cn('rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5',soFoco===v?'bg-foreground text-background':'text-text-2 hover:bg-muted')}>{r as string}</button>)}
   </div>
  </div>
  <ul className="divide-y divide-border">
   {lista.slice(0,limite).map(a=><li key={a.conta.id}>
    <button type="button" onClick={()=>onSelect(a)} className="grid w-full grid-cols-1 items-center gap-x-5 gap-y-2 px-5 py-3 text-left hover:bg-[var(--vr-surface-2)] md:grid-cols-[minmax(160px,1.2fr)_140px_minmax(240px,1.6fr)_56px] md:px-6">
     <span className="min-w-0"><span className="block truncate text-sm font-semibold">{a.conta.name}</span><span className="block truncate text-xs text-text-3">Tier {a.conta.tier} · {delta(a)}</span></span>
     <Medidor nivel={a.nivel}/>
     <span className="grid grid-cols-4 gap-3">{DIMENSOES.slice(0,4).map(d=><Capacidade key={d.key} nome={d.nome==='Profundidade CRM'?'CRM':d.nome} v={a.dimensoes[d.key]}/>)}</span>
     <span className="vr-data text-right text-sm font-semibold" title="Atratividade para a Velora">{pontuacaoFoco(a)}</span>
    </button>
   </li>)}
  </ul>
  {lista.length>limite&&<button type="button" onClick={()=>setLimite(l=>l+25)} className="w-full border-t border-border px-4 py-3 text-sm font-medium text-text-2 hover:bg-muted">Mostrar mais {Math.min(25,lista.length-limite)} · {limite} de {lista.length}</button>}
  {!lista.length&&<div className="p-8 text-center text-sm text-text-3">Nenhuma empresa corresponde aos filtros atuais.</div>}
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
  <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 md:px-6 md:pt-6"><div><LabelCaps>Mapa de capacidades</LabelCaps><h2 className="mt-1 text-lg font-semibold tracking-tight">Onde estão as oportunidades</h2><p className="mt-1 max-w-xl text-xs leading-5 text-text-3">Cada ponto é uma empresa. Eixos mostram <strong className="text-text-2">capacidades técnicas observadas</strong>, não performance.</p></div><span className="vr-data rounded-control border border-border px-2 py-1 text-xs text-text-3">{rows.length} contas</span></div>
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
  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-[var(--vr-surface-2)] px-5 py-3">{[1,2,3].map(n=><span key={n} className="flex items-center gap-2 text-xs text-text-2"><span className="size-2.5 rounded-full" style={{background:corNivel(n)}}/>L{n} {NIVEL_LABEL[n]}</span>)}<span className="ml-auto text-xs text-text-3">Clique em um ponto para investigar</span></div>
 </section>;
}
const DIMENSOES=[
 {key:'medicao',nome:'Mensuração',peso:'GTM · GA4'},
 {key:'midia',nome:'Mídia',peso:'Ads · Meta · LinkedIn'},
 {key:'captacao',nome:'Captação',peso:'Formulário · WhatsApp'},
 {key:'orquestracao',nome:'Profundidade CRM',peso:'Fornecedor × evidência de uso'},
 {key:'eventos',nome:'Eventos',peso:'Clique · conversão'}
] as const;
function MapaCalor({rows}:{rows:AnaliseAquisicao[]}){
 return <section className={cn(secao,'min-w-0 overflow-hidden')}>
  <div className="px-5 pt-5 md:px-6 md:pt-6"><LabelCaps>Leitura por capacidade</LabelCaps><h2 className="mt-1 text-lg font-semibold tracking-tight">Perfil do stack por estágio</h2><p className="mt-1 text-xs text-text-3">Média dos sinais positivos observados por dimensão e estágio.</p></div>
  <div className="overflow-x-auto px-5 pb-5 pt-5 md:px-6"><table className="w-full min-w-[400px] table-fixed border-separate text-left" style={{borderSpacing:'4px 6px'}}>
   <thead><tr><th className="w-16 pb-2 align-bottom text-xs font-semibold uppercase tracking-wider text-text-3">Estágio</th>{DIMENSOES.map(d=><th key={d.key} title={d.peso} className="pb-2 text-center align-bottom text-xs leading-tight font-semibold text-text-3">{d.nome}</th>)}</tr></thead>
   <tbody>{NIVEIS.map(n=>{const subset=rows.filter(r=>r.nivel===n.nivel);return <tr key={n.nivel}><th className="whitespace-nowrap text-xs font-semibold text-text-2">L{n.nivel} <span className="vr-data text-xs font-normal text-text-3">({subset.length})</span></th>
    {DIMENSOES.map(d=>{const sample=subset.map(x=>x.dimensoes[d.key]).filter((v):v is number=>v!==null);
      const v=sample.length?sample.reduce((a,b)=>a+b,0)/sample.length:null;
      return <td key={d.key} title={d.nome+': '+(v===null?'não aferível':Math.round(v)+'% de capacidade observada')} className="p-0">
       <div className="vr-data grid h-10 place-items-center rounded-chip text-xs font-medium" style={v===null?{background:'var(--vr-surface-2)',color:'var(--vr-text-3)'}:{background:'color-mix(in srgb, var(--vr-ok) '+Math.round(Math.max(5,v*.50))+'%, var(--vr-surface) )',color:v>68?'var(--vr-text-inverse)':'var(--vr-text-2)'}}>{v===null?'—':Math.round(v)}</div>
      </td>})}</tr>})}</tbody>
  </table>
  <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-text-3">0 a 100 = intensidade de <strong>evidências web positivas</strong>, não índice de performance.</span><span className="text-xs text-text-3">L4/L5 exigem validação interna antes de contar</span></div></div>
  <div className="mx-5 mb-5 rounded-control border-l-[3px] border-warm bg-warm-bg p-3 text-xs leading-5 text-text-2 md:mx-6"><strong>Leitura estratégica:</strong> o salto de L2 para L3 indica mais ferramentas observáveis. O salto para L4 depende de acesso ao fluxo real de leads, campanhas e receita.</div>
 </section>;
}
function Exportar({rows}:{rows:AnaliseAquisicao[]}){
 const exportar=()=>{
  const cab=['ID','Empresa','Domínio','Tier','Maturidade estimada','Cobertura','Qualidade da evidência','Atratividade','Potencial L4','Maturidade validada','Fornecedor CRM','Profundidade CRM','Prova do CRM','Mensuração','Mídia','Captação','CRM Web','Evento','Hipótese'];
  const csv=[cab.join(';'),...rows.map(a=>[
   a.conta.id,a.conta.name,a.conta.domain,a.conta.tier,a.nivel||'Não aferido',a.confianca,a.qualidadeEvidencia,a.atratividadeVelora,a.potencialL4?'SIM':'NÃO',a.maturidadeConfirmada?'SIM':'NÃO',a.crm.fornecedor,a.crm.score,a.crm.confirmado?'VALIDADO':a.crm.origem,
   a.dimensoes.medicao,a.dimensoes.midia,a.dimensoes.captacao,a.dimensoes.orquestracao,a.dimensoes.eventos??'N/A',a.hipotese
  ].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';'))].join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const el=document.createElement('a');el.href=url;el.download='velora-maturidade-aquisicao.csv';el.click();setTimeout(()=>URL.revokeObjectURL(url),800);
 };
 return <button onClick={exportar} type="button" className="inline-flex h-9 items-center gap-2 rounded-control border border-border bg-card px-3 text-xs font-semibold text-text-2 hover:border-border-strong hover:text-foreground"><Download className="size-3.5"/>Exportar</button>;
}
function Detalhe({a,onClose}:{a:AnaliseAquisicao;onClose:()=>void}){
 const c=a.conta;const nivel=NIVEIS.find(n=>n.nivel===a.nivel);
 return <div className="fixed inset-0 z-50 bg-black/35" onMouseDown={onClose}><aside role="dialog" aria-modal="true" aria-label={'Maturidade de '+c.name} onMouseDown={e=>e.stopPropagation()} className="ml-auto h-full w-full max-w-[590px] overflow-y-auto border-l border-border bg-background shadow-3">
  <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background px-6 py-5"><div><LabelCaps>Diagnóstico exploratório · {c.id}</LabelCaps><h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">{c.name}</h2><p className="mt-1 text-xs text-text-3">{c.domain} · Tier {c.tier}</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-control border border-border p-2 hover:bg-[var(--vr-surface-2)]"><X className="size-4"/></button></div>
  <div className="space-y-5 p-6">
   <div className="flex flex-wrap gap-2"><SeloNivel nivel={a.nivel}/><SeloConfianca estado={a.confianca}/><span className="vr-data rounded-chip border border-border px-2 py-1 text-xs">Atratividade {a.atratividadeVelora}/100</span>{a.potencialL4&&<span className="rounded-chip border border-cool/40 bg-[var(--vr-surface-2)] px-2 py-1 text-xs">Potencial L4 · validar</span>}{c.sourceCohort&&<span className="rounded-chip border border-ok/30 bg-ok-bg px-2 py-1 text-xs font-semibold text-ok">NOVA L12</span>}</div>
   {c.sourceCohort&&<div className="rounded-control border border-warm/30 bg-warm-bg px-3 py-3 text-xs leading-5 text-text-2"><strong>Conta em pesquisa:</strong> {c.sector||"Segmento a confirmar"}{c.region?" · "+c.region:""}. ICP, faturamento e decisores não validados; não liberar automaticamente para cadência comercial.</div>}
   <div className="grid grid-cols-3 gap-2">
    <div className="rounded-control border border-border bg-card p-3"><LabelCaps>Maturidade</LabelCaps><p className="vr-data mt-2 text-xl font-semibold">{a.nivel?'L'+a.nivel:'—'}</p></div>
    <div className="rounded-control border border-border bg-card p-3"><LabelCaps>Evidência</LabelCaps><p className="vr-data mt-2 text-xl font-semibold">{a.qualidadeEvidencia}<span className="text-xs text-text-3">/100</span></p></div>
    <div className="rounded-control border border-border bg-card p-3"><LabelCaps>Atratividade</LabelCaps><p className="vr-data mt-2 text-xl font-semibold">{a.atratividadeVelora}<span className="text-xs text-text-3">/100</span></p></div>
   </div>
   {a.potencialL4&&<section className="rounded-card border border-cool/35 bg-[var(--vr-surface-2)] p-4">
    <strong className="text-sm">Candidata a L4 — não certificada</strong>
    <p className="mt-2 text-xs leading-5 text-text-2">Mensuração, mídia multicanal, automação web e captação observáveis; {a.potencialL4ComEvento?'há também indício de evento comercial específico.':'não foi comprovada a entrega de evento comercial neste teste.'} Permanece em L3 até verificar CRM e receita.</p>
    <p className="mt-2 text-xs text-text-3">{a.requisitosPendentes.slice(0,2).join(' · ')}</p>
   </section>}
   <div className="rounded-card border border-border bg-card p-5"><LabelCaps>Posicionamento estimado</LabelCaps><h3 className="mt-1 text-lg font-semibold">{nivel?.titulo||'Evidência insuficiente'}</h3><p className="mt-2 text-sm leading-6 text-text-2">{nivel?.descricao||'Não foi possível determinar o estágio a partir das páginas e tecnologias públicas auditadas.'}</p><p className="mt-2 text-xs text-text-3">{a.caracterizacaoNivel}</p></div>
   <div className="rounded-card border border-border bg-card p-5"><LabelCaps>Perfil de capacidades</LabelCaps><div className="mt-4 space-y-4">{DIMENSOES.map(d=>{const v=a.dimensoes[d.key];return <div key={d.key}><div className="mb-1.5 flex justify-between gap-2 text-xs"><span className="font-medium">{d.nome}</span><span className="vr-data text-text-3">{v===null?'Não testado':v+'/100'}</span></div><div className="h-2 w-full overflow-hidden rounded-chip bg-[var(--vr-surface-3)]"><div className="h-full bg-foreground transition-[width]" style={{width:v===null?'0%':v+'%'}}/></div><p className="mt-1 text-xs text-text-3">{d.peso}</p></div>})}</div><p className="mt-4 border-t border-border pt-3 text-xs text-text-3">Pontuações medem presença de evidência; não comprovam eficiência.</p></div>
   <section className="rounded-card border border-border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div><LabelCaps>Potencial do CRM · evidência graduada</LabelCaps><h3 className="mt-1 text-lg font-semibold">{a.crm.fornecedor}</h3>
      <p className="mt-1 text-xs text-text-3">{a.crm.descricao}</p></div>
     <div className="text-right"><span className="vr-data text-3xl font-semibold">{a.crm.score}</span><span className="vr-data text-xs text-text-3">/100</span>
     <span className="block text-xs text-text-3">{a.crm.confirmado?'CRM comercial verificado':a.crm.origem==='script_web'?'Somente script web':a.crm.origem==='historico'?'Só registro histórico':'Sem prova positiva'}</span></div>
    </div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--vr-surface-3)]"><div className="h-full rounded-full bg-cool" style={{width:a.crm.score+'%'}}/></div>
    <p className="mt-3 text-xs leading-5 text-text-2">{a.crm.observacao}</p>
    <p className="mt-2 border-t border-border pt-3 text-xs leading-5 text-text-3"><strong>Para aprofundar:</strong> {a.crm.proximaValidacao}</p>
   </section>
   <div className="rounded-card border border-border bg-card p-5"><LabelCaps>Achados técnicos positivos</LabelCaps><div className="mt-3 flex flex-wrap gap-2">{a.indicios.map(t=><span key={t} className="rounded-chip border border-border bg-[var(--vr-surface-2)] px-2.5 py-1.5 text-xs text-text-2">{t}</span>)}{!a.indicios.length&&<span className="text-sm text-text-3">Nenhuma evidência suficiente nas páginas testadas.</span>}</div>
   <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4"><div><LabelCaps>Formulários DOM</LabelCaps><p className="vr-data mt-1 text-xl font-semibold">{c.forms}</p></div><div><LabelCaps>Links WhatsApp DOM</LabelCaps><p className="vr-data mt-1 text-xl font-semibold">{c.whatsappLinks}</p></div></div></div>
   {!!c.historicalTech?.length&&<div className="rounded-card border border-border bg-card p-5"><LabelCaps>Histórico de tecnologias · provedor</LabelCaps><p className="mt-1 text-xs text-text-3">Inventário histórico Clay/BuiltWith. Não indica instalação ativa e não entra no nível de maturidade.</p><div className="mt-3 flex flex-wrap gap-1.5">{c.historicalTech.slice(0,14).map((t,i)=><span key={t+i} className="rounded-chip border border-border px-2 py-1 text-xs text-text-2">{t}</span>)}</div></div>}
   <div className="rounded-card border-l-4 border-l-foreground bg-[var(--vr-surface-2)] p-5"><LabelCaps>Hipótese de Growth para validar</LabelCaps><p className="mt-2 text-sm font-semibold leading-6">{a.hipotese}</p><p className="mt-3 text-xs leading-5 text-text-2"><strong>Próximo teste:</strong> {a.proximoTeste}</p></div>
   <div className="flex flex-wrap gap-2">
    <a href={'https://'+c.domain} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-2 rounded-control border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-[var(--vr-surface-2)]"><ExternalLink className="size-3.5"/> Site</a>
    {c.evidence.startsWith('https://github.com/')&&<a href={c.evidence} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-2 rounded-control border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-[var(--vr-surface-2)]"><Fingerprint className="size-3.5"/> Fonte do scanner</a>}
    <Link href={'/aquisicao/stack'} className="inline-flex items-center gap-2 rounded-control bg-foreground px-3 py-2 text-xs font-semibold text-background"><Layers3 className="size-3.5"/> Explorar stack detalhado</Link>
   </div>
  </div>
 </aside></div>;
}
export function TelaMaturidade({base,dados}:{base:BaseCasca;dados:DadosAquisicao}){
 const todas=useMemo(()=>analisarBase(dados.accounts),[dados]);
 const [busca,setBusca]=useState('');const [tier,setTier]=useState('todos');
 const [nivel,setNivel]=useState(-1);const [confidence,setConfidence]=useState('todos');
 const [selected,setSelected]=useState<AnaliseAquisicao|null>(null);const [focusOnly,setFocusOnly]=useState(false);const [onlyNew,setOnlyNew]=useState(false);const [potentialOnly,setPotentialOnly]=useState(false);const [crmFilter,setCrmFilter]=useState<'todos'|'enterprise'|'rd'|'verificado'>('todos');const [soFocoLista,setSoFocoLista]=useState(true);
 const rows=useMemo(()=>todas.filter(a=>{
   const match=!busca||[a.conta.name,a.conta.domain,a.conta.id].join(' ').toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR'));
   return match&&(tier==='todos'||a.conta.tier===tier)&&(nivel===-1||a.nivel===nivel)&&
    (confidence==='todos'||a.confianca===confidence)&&(!focusOnly||a.foco)&&(!onlyNew||!!a.conta.sourceCohort)&&(!potentialOnly||a.potencialL4)&& (crmFilter==='todos'||crmFilter==='enterprise'&&a.crm.potencialEnterprise||crmFilter==='rd'&&a.conta.tags.rdStation==='network'||crmFilter==='verificado'&&a.crm.confirmado);
  }),[todas,busca,tier,nivel,confidence,focusOnly,onlyNew,potentialOnly,crmFilter]);
 const novos=todas.filter(x=>!!x.conta.sourceCohort);
 const potenciaisL4=todas.filter(a=>a.potencialL4);
 const activeFilters=busca||tier!=='todos'||nivel!==-1||confidence!=='todos'||focusOnly||onlyNew||potentialOnly||crmFilter!=='todos';
 return <Casca base={base}>
  <main className="mx-auto w-full max-w-[1560px] px-4 pb-28 pt-4 md:px-8 md:pb-16 md:pt-8">
   <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div><div className="mb-2 flex items-center gap-2"><span className="size-[7px] rounded-full bg-ok"/><LabelCaps>Inteligência Velora · maturidade de aquisição</LabelCaps></div>
     <h1 className="font-display text-2xl font-semibold tracking-tight">Maturidade de aquisição</h1>
     <p className="mt-1 max-w-2xl text-sm text-text-3">Onde existe capacidade instalada, mas ainda há espaço para transformar aquisição em crescimento previsível.</p></div>
    <div className="flex flex-wrap items-center gap-2"><span className="vr-data rounded-control border border-border bg-card px-2.5 py-2 text-xs text-text-3">Evidências · 08 NOV 2026</span><span className="vr-data rounded-control border border-ok/35 bg-ok-bg px-2.5 py-2 text-xs font-semibold text-ok">+{novos.length} contas L12</span><Link href="/aquisicao/stack" className="inline-flex h-9 items-center gap-2 rounded-control border border-border bg-card px-3 text-xs font-semibold hover:bg-[var(--vr-surface-2)]"><Layers3 className="size-3.5"/> Stack detalhado <ArrowUpRight className="size-3"/></Link></div>
   </header>
   <ReguaMaturidade analises={todas} ativo={nivel} onPick={x=>{setNivel(x);setFocusOnly(false);setPotentialOnly(false)}}/>
   <div className="mt-4 flex flex-wrap items-center gap-2 rounded-card border border-border bg-card px-3 py-3">
    <SlidersHorizontal className="ml-1 size-4 text-text-3"/><div className="relative min-w-[180px] flex-1 md:max-w-[320px]"><Search className="absolute left-3 top-2.5 size-3.5 text-text-3"/><input value={busca} onChange={e=>setBusca(e.target.value)} className="h-9 w-full rounded-control border border-border-strong bg-background py-1.5 pl-9 pr-3 text-xs outline-none" placeholder="Buscar empresa ou domínio" aria-label="Buscar empresa ou domínio"/></div>
    <select value={tier} onChange={e=>setTier(e.target.value)} aria-label="Filtrar Tier" className="h-9 rounded-control border border-border-strong bg-background px-3 text-xs"><option value="todos">Todos os tiers</option><option value="A">Tier A</option><option value="B">Tier B</option><option value="C">Tier C</option></select>
    <select value={nivel} onChange={e=>{setNivel(Number(e.target.value));setFocusOnly(false)}} aria-label="Filtrar estágio" className="h-9 rounded-control border border-border-strong bg-background px-3 text-xs"><option value={-1}>Todos os estágios</option><option value={0}>Inconclusivas</option>{NIVEIS.map(n=><option key={n.nivel} value={n.nivel}>L{n.nivel} · {n.titulo}</option>)}</select>
    <select value={confidence} onChange={e=>setConfidence(e.target.value)} aria-label="Filtrar cobertura" className="h-9 rounded-control border border-border-strong bg-background px-3 text-xs"><option value="todos">Toda cobertura</option><option value="adequada">Adequada</option><option value="parcial">Parcial</option><option value="insuficiente">Insuficiente</option></select>
    <button type="button" onClick={()=>{setFocusOnly(!focusOnly);setNivel(-1)}} className={cn('inline-flex h-9 items-center gap-2 rounded-control border px-3 text-xs font-semibold',focusOnly?'border-foreground bg-foreground text-background':'border-border bg-card text-text-2')}><Target className="size-3.5"/>Só foco L2/L3</button>
    <button type="button" onClick={()=>setOnlyNew(!onlyNew)} className={cn("inline-flex h-9 items-center gap-2 rounded-control border px-3 text-xs font-semibold",onlyNew?"border-foreground bg-foreground text-background":"border-border bg-card text-text-2")}>Novas L12 ({novos.length})</button>
    <button type="button" onClick={()=>{setPotentialOnly(!potentialOnly);setNivel(-1);setFocusOnly(false)}} className={cn("inline-flex h-9 items-center gap-2 rounded-control border px-3 text-xs font-semibold",potentialOnly?"border-foreground bg-foreground text-background":"border-border bg-card text-text-2")}>Potencial L4 ({potenciaisL4.length})</button>
    {activeFilters&&<button onClick={()=>{setBusca('');setTier('todos');setNivel(-1);setConfidence('todos');setFocusOnly(false);setOnlyNew(false);setPotentialOnly(false);setCrmFilter('todos')}} className="px-2 text-xs font-medium text-text-3 hover:text-foreground">Limpar</button>}
    <span className="ml-auto flex items-center gap-3"><span className="vr-data text-xs text-text-3">{rows.length} contas</span><Exportar rows={rows}/></span>
   </div>
   <div className="mt-4"><ListaMaturidade rows={rows} onSelect={setSelected} soFoco={soFocoLista} onSoFoco={setSoFocoLista}/></div>
   {/* o detalhe do método fica recolhido: totais, CRM, mapa de capacidades e perfil por estágio */}
   <details className="group mt-4 rounded-card border border-border bg-card">
    <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold md:px-6">Ver o método e o detalhe <span className="font-normal text-text-3">· {fmt(todas.length)} contas monitoradas, {fmt(todas.filter(a=>a.conta.validPages>0).length)} sites auditados, {fmt(potenciaisL4.length)} com potencial L4, {fmt(novos.length)} novas (L12), CRM e mapa de capacidades</span></summary>
    <div className="flex flex-col gap-4 border-t border-border p-4 md:p-5">
   <section className="mb-4 rounded-card border border-border bg-card p-4 md:px-6 md:py-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><LabelCaps>Inteligência comercial · CRM</LabelCaps><h2 className="mt-1 text-lg font-semibold">A profundidade do CRM muda o patamar</h2>
     <p className="mt-1 max-w-3xl text-xs leading-5 text-text-3">Salesforce e HubSpot têm maior potencial de operação comercial. Scripts de tracking são sinais para pesquisar — não provas de Sales Cloud, Sales Hub ou integração com receita.</p></div>
     <span className="rounded-chip border border-border bg-[var(--vr-surface-2)] px-2.5 py-1.5 text-xs text-text-3">Modelo de profundidade v3</span></div>
    <div className="grid gap-2 sm:grid-cols-3">
     <button type="button" aria-pressed={crmFilter==='enterprise'} onClick={()=>setCrmFilter(crmFilter==='enterprise'?'todos':'enterprise')} className={cn("rounded-control border p-3 text-left transition-colors hover:border-border-strong",crmFilter==='enterprise'?"border-cool bg-[var(--vr-surface-2)]":"border-border")}>
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-text-2">Salesforce / HubSpot</span><span className="vr-data text-2xl font-semibold">{todas.filter(x=>x.crm.potencialEnterprise).length}</span></div>
      <p className="mb-0 mt-1 text-xs text-text-3">Sinais públicos de stack enterprise (não CRM validado)</p>
     </button>
     <button type="button" aria-pressed={crmFilter==='rd'} onClick={()=>setCrmFilter(crmFilter==='rd'?'todos':'rd')} className={cn("rounded-control border p-3 text-left transition-colors hover:border-border-strong",crmFilter==='rd'?"border-cool bg-[var(--vr-surface-2)]":"border-border")}>
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-text-2">RD Station web</span><span className="vr-data text-2xl font-semibold">{todas.filter(x=>x.conta.tags.rdStation==='network').length}</span></div>
      <p className="mb-0 mt-1 text-xs text-text-3">Automação/marketing, sem comprovar CRM de vendas</p>
     </button>
     {(todas.some(x=>x.crm.confirmado)||crmFilter==='verificado')&&(
     <button type="button" aria-pressed={crmFilter==='verificado'} onClick={()=>setCrmFilter(crmFilter==='verificado'?'todos':'verificado')} className={cn("rounded-control border p-3 text-left transition-colors hover:border-border-strong",crmFilter==='verificado'?"border-cool bg-[var(--vr-surface-2)]":"border-border")}>
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-text-2">CRM comercial verificado</span><span className="vr-data text-2xl font-semibold">{todas.filter(x=>x.crm.confirmado).length}</span></div>
      <p className="mb-0 mt-1 text-xs text-text-3">Uso confirmado com fornecedor, pipeline e fonte</p>
     </button>
     )}
    </div>
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-3">
     <span><strong className="text-foreground">HubSpot web ≈ 46</strong> pontos de potencial CRM</span>
     <span><strong className="text-foreground">RD Station web ≈ 18</strong> pontos</span>
     <span><strong className="text-foreground">Salesforce/Sales Hub confirmado ≈ 84–98</strong> pontos, conforme edição</span>
    </div>
   </section>
     <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_.8fr]"><Mapa rows={rows} onSelect={setSelected}/><MapaCalor rows={rows}/></div>
    </div>
   </details>
   <div className="mt-4 flex items-start gap-3 rounded-card border border-border bg-[var(--vr-surface-2)] px-4 py-4 text-xs leading-5 text-text-3"><ShieldAlert className="mt-0.5 size-4 shrink-0"/><div><strong className="text-text-2">Limite da pesquisa:</strong> este modelo separa maturidade estimada, qualidade da evidência e atratividade comercial. L4/L5 são atingíveis mediante dados operacionais verificados; potenciais L4 não são promovidas automaticamente. “Não observado” não significa ausência. Pixels não comprovam campanhas ativas, e scripts web não comprovam CRM integrado. <Link className="ml-1 underline underline-offset-2" href="/aquisicao/stack">Ver os dados brutos</Link>.</div></div>
  </main>
  {selected&&<Detalhe a={selected} onClose={()=>setSelected(null)}/>}
 </Casca>;
}
