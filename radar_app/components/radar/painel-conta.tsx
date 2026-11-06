'use client';

import { CheckCircle2, Circle, Flame, UserRound } from 'lucide-react';
import { ANEIS, BRACOS, type ContaProximidade } from '@/lib/proximidade';
import { Curva } from '@/components/hoje/score';
import { PainelFlutuante } from '@/components/ui/painel-flutuante';
import { cn } from '@/lib/utils';

const ROTULO_PAPEL: Record<ContaProximidade['comite'][number]['papelIcp'], string> = {
  dono_problema: 'Dono do problema',
  pagador: 'Pagador',
  influenciador: 'Influenciador',
  guardiao: 'Guardião',
};

function GrafoComite({ conta }: { conta: ContaProximidade }) {
  const linhas = 24 + conta.comite.length * 40 + (conta.caminhoQuenteVia ? 40 : 0);
  return (
    <svg viewBox={`0 0 280 ${linhas}`} width="100%" height={linhas} className="overflow-visible">
      <circle cx={28} cy={linhas / 2} r={16} className="fill-secondary" stroke="var(--vr-border-strong)" />
      <text x={28} y={linhas / 2 + 4} textAnchor="middle" className="fill-text-2 text-[10px] font-semibold">
        {conta.nome.slice(0, 2).toUpperCase()}
      </text>
      {conta.comite.map((p, i) => {
        const y = 24 + i * 40;
        const completo = p.mapeado && p.canalVerificado;
        return (
          <g key={i}>
            <line x1={44} y1={linhas / 2} x2={96} y2={y} stroke={completo ? 'var(--vr-ok)' : 'var(--vr-border-strong)'} strokeWidth={1.5} strokeDasharray={completo ? undefined : '3 3'} />
            <circle cx={96} cy={y} r={3} fill={completo ? 'var(--vr-ok)' : 'var(--vr-text-3)'} />
            <text x={106} y={y - 4} className="fill-foreground text-[11px] font-medium">
              {p.nome}
            </text>
            <text x={106} y={y + 10} className="fill-text-3 text-[10px]">
              {p.cargo} · {ROTULO_PAPEL[p.papelIcp]}
            </text>
          </g>
        );
      })}
      {conta.caminhoQuenteVia && (
        <g>
          <line
            x1={44}
            y1={linhas / 2}
            x2={96}
            y2={24 + conta.comite.length * 40}
            stroke="var(--vr-acid)"
            strokeWidth={1.5}
            strokeDasharray="1 4"
            strokeLinecap="round"
          />
          <circle cx={96} cy={24 + conta.comite.length * 40} r={3} fill="var(--vr-acid)" />
          <text x={106} y={24 + conta.comite.length * 40 - 4} className="fill-foreground text-[11px] font-medium">
            {conta.caminhoQuenteVia}
          </text>
          <text x={106} y={24 + conta.comite.length * 40 + 10} className="fill-text-3 text-[10px]">
            Caminho quente (1º/2º grau)
          </text>
        </g>
      )}
    </svg>
  );
}

function BarraDimensao({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-2">{rotulo}</span>
        <span className="vr-data text-text-3">{Math.round(valor * 100)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.round(valor * 100)}%` }} />
      </div>
    </div>
  );
}

export function PainelConta({ conta, aberto, onFechar }: { conta: ContaProximidade | null; aberto: boolean; onFechar: () => void }) {
  if (!conta) return null;
  const anelInfo = ANEIS.find(a => a.id === conta.anel)!;
  const braco = BRACOS.find(b => b.id === conta.braco)!;

  return (
    <PainelFlutuante aberto={aberto} onFechar={onFechar} titulo={conta.nome} descricao={[braco.rotulo, conta.subsegmento, conta.uf, conta.tier && `Tier ${conta.tier}`].filter(Boolean).join(' · ')}>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Curva serie={conta.trajetoria.map(p => p.proximity)} largura={120} altura={36} classe={conta.sinalRelevante ? 'text-warm' : 'text-text-3'} />
          <div>
            <span
              className={cn(
                'inline-flex items-center rounded-chip px-2 py-0.5 text-xs font-medium',
                conta.convertida ? 'bg-acid-soft text-foreground' : conta.anel === 1 ? 'bg-ok-bg text-ok' : 'bg-secondary text-text-2',
              )}
            >
              {conta.convertida ? 'Convertida' : `${conta.anel}. ${anelInfo.rotulo}`}
            </span>
            <p className="mt-1 text-xs text-text-3">{anelInfo.descricao}</p>
          </div>
        </div>

        {conta.frase && <p className="text-sm text-text-2">{conta.frase}</p>}

        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <BarraDimensao rotulo="Fit" valor={conta.dimensoes.fit} />
          <BarraDimensao rotulo="Timing" valor={conta.dimensoes.timing} />
          <BarraDimensao rotulo="Acesso" valor={conta.dimensoes.access} />
          <BarraDimensao rotulo="Engajamento" valor={conta.dimensoes.engagement} />
        </div>

        <div>
          <h3 className="text-xs font-semibold text-text-3">O que falta</h3>
          <ul className="mt-2 space-y-1.5">
            {conta.pecasFaltantes.length === 0 ? (
              <li className="flex items-center gap-2 text-sm text-ok">
                <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.5} />
                Nada faltando — pronta para abordagem.
              </li>
            ) : (
              conta.pecasFaltantes.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-2">
                  <Circle className="mt-0.5 size-3 shrink-0 text-text-3" strokeWidth={1.5} />
                  {p}
                </li>
              ))
            )}
          </ul>
        </div>

        {conta.ultimoSinal && (
          <div className="flex items-start gap-2 rounded-control bg-secondary/60 px-3 py-2 text-sm">
            <Flame className="mt-0.5 size-4 shrink-0 text-warm" strokeWidth={1.5} />
            <div>
              <p className="text-foreground">{conta.ultimoSinal.rotulo}</p>
              <p className="text-xs text-text-3">há {conta.ultimoSinal.diasAtras} dias</p>
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-1 text-xs font-semibold text-text-3">Comitê</h3>
          {conta.comite.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-text-3">
              <UserRound className="size-4" strokeWidth={1.5} />
              Ninguém mapeado ainda.
            </p>
          ) : (
            <GrafoComite conta={conta} />
          )}
        </div>
      </div>
    </PainelFlutuante>
  );
}
