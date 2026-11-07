'use client';

import { useMemo } from 'react';
import type { Base, PapelAbm } from '@/lib/tipos';
import { perfilDecisores } from '@/lib/perfil-decisores';
import { COR_BARRA } from '@/lib/papeis';
import { Bloco, Colunas, FaixaPerfil, Numero, Ranking, Segmentos, num, pct } from '@/components/ui/perfil-compacto';

/** Nível é ordinal (do topo para a base): um tom só, do mais escuro para o mais claro. */
const OPACIDADE_NIVEL = [1, 0.78, 0.6, 0.45, 0.32, 0.2];

/**
 * Perfil da base de decisores em uma faixa: nível e papel no comitê como barra segmentada, top funções e
 * contatos por empresa. Clicar no papel filtra a tabela; "Expandir análise" abre as lacunas e a leitura.
 */
export function PerfilBase({ base, papeisAtivos, onPapel }: { base: Base; papeisAtivos: PapelAbm[]; onPapel: (p: PapelAbm) => void }) {
  const p = useMemo(() => perfilDecisores(base), [base]);
  const semDecisor = p.lacunas.find(l => l.id === 'Decisor');
  return (
    <FaixaPerfil
      id="decisores"
      titulo="Perfil da base de decisores"
      leituras={p.leituras}
      numeros={
        <>
          <Numero rotulo="Pessoas" valor={num(p.pessoas)} nota={`em ${num(p.contas)} contas`} />
          <Numero rotulo="Por conta" valor={num(p.mediaPorConta, 1)} nota={`mediana ${p.medianaPorConta}`} />
          <Numero
            rotulo="Comitê completo"
            valor={`${pct(p.comiteCompleto, p.contas)}%`}
            nota={semDecisor ? `${num(semDecisor.valor)} contas sem decisor` : `${num(p.comiteCompleto)} contas`}
            alerta={!!semDecisor}
          />
          <Numero rotulo="Com e-mail" valor={`${pct(p.comEmail, p.pessoas)}%`} nota={`${pct(p.comLinkedin, p.pessoas)}% com LinkedIn`} />
        </>
      }
      blocos={
        <>
          <Bloco titulo="Nível hierárquico">
            <Segmentos barras={p.niveis} total={p.pessoas} estilo={(_, i) => ({ className: 'bg-cool', style: { opacity: OPACIDADE_NIVEL[i] } })} />
          </Bloco>
          <Bloco titulo="Papel no comitê" dica="clique filtra">
            <Segmentos
              barras={p.papeis}
              total={p.pessoas}
              estilo={b => ({ className: COR_BARRA[b.id as PapelAbm] })}
              ativos={papeisAtivos}
              onClicar={b => onPapel(b.id as PapelAbm)}
            />
          </Bloco>
          <Bloco titulo="Principais funções">
            <Ranking barras={p.funcoes.filter(f => f.rotulo !== 'Outras').slice(0, 5)} total={p.pessoas} />
          </Bloco>
          <Bloco titulo="Contatos por empresa">
            <Colunas
              barras={p.contatosPorConta}
              total={p.contas}
              rotulo="Contas por número de contatos mapeados"
              dica={b => `${num(b.valor)} contas com ${b.rotulo} ${b.rotulo === '1' ? 'contato' : 'contatos'}`}
            />
          </Bloco>
        </>
      }
      detalhe={
        <>
          <Bloco titulo="Todas as funções">
            <Ranking barras={p.funcoes} total={p.pessoas} />
          </Bloco>
          <Bloco titulo="Onde falta gente no comitê" dica="contas sem o papel">
            <Ranking barras={p.lacunas} total={p.contas} cor="bg-warm" unidade="contas" />
            <p className="mt-2 text-[11px] text-text-3">
              {num(p.comiteCompleto)} de {num(p.contas)} contas ({pct(p.comiteCompleto, p.contas)}%) têm decisor, dono da dor e quem assina o cheque.
            </p>
          </Bloco>
        </>
      }
    />
  );
}
