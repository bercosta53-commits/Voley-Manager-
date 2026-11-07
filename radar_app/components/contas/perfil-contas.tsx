'use client';

import { useMemo } from 'react';
import type { Base } from '@/lib/tipos';
import { perfilContas } from '@/lib/perfil-contas';
import { Bloco, Colunas, FaixaPerfil, Numero, Ranking, Segmentos, num, pct } from '@/components/ui/perfil-compacto';

const COR_TIER_BARRA: Record<string, string> = { A: 'bg-ok', B: 'bg-cool', C: 'bg-border-strong' };
/** Faixas do score em ordem: frio (cinza) → atenção (ardósia) → emergente (âmbar) → alta/máxima (verde). */
const COR_STATUS_BARRA: Record<string, string> = {
  Monitoramento: 'bg-border-strong',
  Atenção: 'bg-cool',
  'Oportunidade emergente': 'bg-warm',
  'Alta prioridade': 'bg-ok',
  'Prioridade máxima': 'bg-foreground',
};

/**
 * Perfil da base de contas em uma faixa, acima da tabela: ICP, momento pelo score, o que as contas fazem e
 * onde estão. Clicar no tier filtra a tabela; "Expandir análise" abre famílias, especializações e modelo.
 */
export function PerfilContas({ base, tiersAtivos, onTier }: { base: Base; tiersAtivos: string[]; onTier: (t: string) => void }) {
  const p = useMemo(() => perfilContas(base), [base]);
  return (
    <FaixaPerfil
      id="contas"
      titulo="Perfil da base de contas"
      leituras={p.leituras}
      numeros={
        <>
          <Numero rotulo="Contas" valor={num(p.contas)} nota={`${p.tierA} tier A`} />
          <Numero rotulo="Sinal em 30 dias" valor={num(p.comSinal30)} nota={`${pct(p.comSinal30, p.contas)}% da base`} />
          <Numero
            rotulo="Atenção ou acima"
            valor={num(p.atencaoOuMais)}
            nota={p.paraAbordar ? `${p.paraAbordar} pedem abordagem` : 'nenhuma pede abordagem hoje'}
            alerta={!p.paraAbordar}
          />
          <Numero rotulo="CNPJ confirmado" valor={`${pct(p.comCnpj, p.contas)}%`} nota={`${p.semUf} contas sem UF`} alerta={p.semUf > 0} />
        </>
      }
      blocos={
        <>
          <Bloco titulo="Tier de ICP" dica="clique filtra">
            <Segmentos
              barras={p.tiers}
              total={p.contas}
              estilo={b => ({ className: COR_TIER_BARRA[b.id] })}
              ativos={tiersAtivos}
              onClicar={b => onTier(b.id)}
            />
          </Bloco>
          <Bloco titulo="Momento (status do score)">
            <Segmentos barras={p.status} total={p.contas} estilo={b => ({ className: COR_STATUS_BARRA[b.id] })} />
          </Bloco>
          <Bloco titulo="Principais ramos de TI">
            <Ranking barras={p.ramos.filter(r => r.id).slice(0, 5)} total={p.contas} unidade="contas" />
          </Bloco>
          <Bloco titulo="Onde estão">
            <Colunas barras={p.ufs} total={p.contas} rotulo="Contas por estado" dica={b => `${num(b.valor)} contas em ${b.rotulo}`} />
          </Bloco>
        </>
      }
      detalhe={
        <>
          <Bloco titulo="Famílias de TI">
            <Ranking barras={p.familias} total={p.contas} unidade="contas" />
          </Bloco>
          <Bloco titulo="Especializações e modelo" dica="fora as generalistas">
            <Ranking barras={p.especializacoes.slice(0, 6)} total={p.contas} unidade="contas" cor="bg-warm" />
            <div className="mt-3">
              <Segmentos barras={p.modelos} total={p.contas} estilo={(_, i) => ({ className: 'bg-cool', style: { opacity: [1, 0.6, 0.35, 0.2][i] ?? 0.2 } })} />
            </div>
          </Bloco>
        </>
      }
    />
  );
}
