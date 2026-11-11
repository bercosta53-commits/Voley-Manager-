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
      colunas={5}
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
          <Bloco titulo={p.comFuncionarios ? 'Funcionários' : 'Porte (Receita)'} dica={p.comFuncionarios ? `${p.comFuncionarios} contas com dado` : 'pelo CNPJ'}>
            {p.comFuncionarios ? (
              <Segmentos barras={p.funcionarios} total={p.comFuncionarios} estilo={(_, i) => ({ className: 'bg-cool', style: { opacity: 0.25 + (0.75 * i) / 5 } })} />
            ) : (
              <Segmentos
                barras={p.portes}
                total={p.contas}
                estilo={b => ({ className: b.id === 'Sem CNPJ' ? 'bg-border' : 'bg-cool', style: { opacity: { Micro: 0.35, Pequena: 0.6, 'Média ou grande': 1 }[b.id] ?? 1 } })}
              />
            )}
          </Bloco>
          <Bloco titulo="Principais ramos de TI">
            <Ranking barras={p.ramos.filter(r => r.id).slice(0, 5)} total={p.contas} unidade="contas" />
          </Bloco>
          <Bloco titulo="Região">
            <Segmentos
              barras={p.regioes}
              total={p.contas}
              estilo={b => ({ className: b.id === 'Sem UF' ? 'bg-border' : 'bg-warm', style: { opacity: { Sudeste: 1, Sul: 0.75, Nordeste: 0.55, 'Centro-Oeste': 0.4, Norte: 0.3 }[b.id] ?? 1 } })}
            />
            <p className="mt-1 truncate text-[11px] text-text-3">
              {p.ufs
                .filter(u => u.id !== '__outros')
                .map(u => `${u.rotulo} ${num(u.valor)}`)
                .join(' · ')}
            </p>
          </Bloco>
        </>
      }
      detalhe={
        <>
          <Bloco titulo="Estados" dica="contas com UF">
            <Colunas barras={p.todasUfs.slice(0, 12)} total={p.contas} rotulo="Contas por estado" dica={b => `${num(b.valor)} contas em ${b.rotulo}`} />
          </Bloco>
          <Bloco titulo="Capital social" dica="proxy de porte, pela Receita">
            <Ranking barras={p.capital} total={p.comCnpj} unidade="contas" />
            <p className="mt-2 text-[11px] text-text-3">
              Número de funcionários: {p.comFuncionarios ? `${p.comFuncionarios} contas com dado.` : 'ainda sem fonte (o Apollo traz quando a cobrança for regularizada).'}
            </p>
          </Bloco>
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
