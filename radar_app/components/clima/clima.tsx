'use client';

import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import type { Base } from '@/lib/tipos';
import { calcularClima, fmtClima, type DadosClima, type EstadoClima } from '@/lib/clima';
import { baixarCsv } from '@/lib/exportar-csv';
import { Casca } from '@/components/casca/casca';
import { Button } from '@/components/ui/button';
import { ClimaBrasil, Indicadores, PoliticaBolsa } from './clima-brasil';
import { MapaVerticais, PainelVertical } from './mapa-verticais';
import { LinhaTempoClima, MapaCalor, TabelaVerticais, type Chave } from './detalhes';

function quando(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

/**
 * Aba Clima: o mercado está abrindo ou fechando janelas para o ICP — e para quais contas. Clima Brasil e
 * indicadores macro no topo; mapa de verticais com o painel da selecionada; de onde vem o clima; linha do
 * tempo; relatório por vertical. Contas, tier e VSCS vêm da base; o resto de data/clima.json.
 */
export function TelaClima({ base, dados }: { base: Base; dados: DadosClima }) {
  const clima = useMemo(() => calcularClima(dados, base), [dados, base]);
  const [sel, setSel] = useState('ESP01');
  const [filtro, setFiltro] = useState<EstadoClima | 'todos'>('todos');
  const [hover, setHover] = useState<string | null>(null);
  const [modo, setModo] = useState<'contrib' | 'sens'>('contrib');
  const [periodo, setPeriodo] = useState(26);
  const [ordem, setOrdem] = useState<{ chave: Chave; dir: 1 | -1 }>({ chave: 'S', dir: 1 });
  const vertical = clima.verticais.find(v => v.id === sel) ?? clima.verticais[0]!;
  const temHistorico = dados.historicoMedido !== false;
  const metodo = dados.metodo ?? (dados.simulado ? 'Protótipo com notas e histórico por vertical simulados.' : null);

  const exportar = () =>
    baixarCsv(
      `clima-por-vertical-${dados.atualizadoEm.slice(0, 10)}.csv`,
      ['Vertical', 'Códigos', 'Clima', 'Nível S', 'Δ 30 dias', 'Confiança', temHistorico ? 'Desde' : 'Revisão', 'Por quê', 'Contas', 'Tier A', 'Contra a maré', 'Jogada', 'Ação recomendada', 'Fontes'],
      clima.verticais.map(v => [v.nome, v.codigos.join('+'), v.estado, fmtClima(v.S), temHistorico ? fmtClima(v.delta30) : '', v.confianca, v.desde, v.porque, v.contas, v.tierA, v.contraMare, v.jogada, v.jogadaTexto, v.fontes?.map(f => f.url).join(' | ') ?? '']),
    );

  return (
    <Casca base={base}>
      <main className="flex w-full max-w-[1440px] flex-col gap-6 px-4 pt-2 pb-28 md:px-8 md:pt-8 md:pb-16 print:max-w-none print:p-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Clima</h1>
            <p className="mt-1 text-sm text-text-2">O mercado está abrindo ou fechando janelas para o seu ICP — e para quais contas.</p>
            <p className="mt-1 text-xs text-text-3">
              Edição de {quando(dados.atualizadoEm)} · {dados.indicadoresEmDia[0]} indicadores com fonte
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button onClick={exportar}>
              <Download /> Exportar relatório
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <FileText /> Relatório semanal
            </Button>
          </div>
        </div>

        {metodo && (
          // nota de método, não alerta: tom neutro e discreto
          <p role="note" className="-mt-2 text-xs text-text-3">
            {metodo}
          </p>
        )}

        <section aria-label="Clima Brasil" className="grid gap-4 lg:grid-cols-3">
          <ClimaBrasil clima={clima} />
          <Indicadores clima={clima} />
        </section>

        <PoliticaBolsa clima={clima} />

        <section aria-label="Mapa de clima por vertical" className="vr-card flex flex-wrap gap-6 p-5">
          <MapaVerticais clima={clima} sel={sel} filtro={filtro} hover={hover} onSel={setSel} onFiltro={setFiltro} onHover={setHover} />
          <PainelVertical clima={clima} v={vertical} />
        </section>

        <MapaCalor clima={clima} sel={sel} modo={modo} onModo={setModo} onSel={setSel} />
        {temHistorico && <LinhaTempoClima clima={clima} periodo={periodo} onPeriodo={setPeriodo} />}
        <TabelaVerticais clima={clima} sel={sel} ordem={ordem} onOrdem={setOrdem} onSel={setSel} />
      </main>
    </Casca>
  );
}
