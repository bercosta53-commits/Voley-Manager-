'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Base } from '@/lib/tipos';
import { ANEIS, BRACOS, TIPOS_SINAL, UFS, type Anel, type BaseProximidade, type Braco, type UF } from '@/lib/proximidade';
import { faixaProximityPorAnel, pontoAtual, pontoHistorico } from '@/lib/proximidade-layout';
import { Casca } from '@/components/casca/casca';
import { MenuFiltro } from '@/components/contas/menu-filtro';
import { cn, plural } from '@/lib/utils';
import { RadarSvg } from './radar-svg';
import { ControleReplay } from './controle-replay';
import { PainelConta } from './painel-conta';
import { Flame, Sparkles } from 'lucide-react';
import { useEstados } from '@/components/hoje/estado';
import { ACOES_DE_ABORDAGEM, FAIXAS_VSCS, aplicarAvaliacoes } from '@/lib/avaliacao';
import { PORTES, REGIOES, SEM_UF, porteDe, regiaoDe } from '@/lib/regioes';
import { MovimentosSemana } from './movimentos-semana';

const CHAVE_ULTIMA_VISITA = 'vr:radar:ultima-visita';

interface UltimaVisita {
  em: string;
  aneis: Record<string, Anel>;
}

/** Mini alvo de 4 anéis concêntricos com o anel relevante destacado — mesma leitura visual do radar grande. */
function IconeAnel({ anel }: { anel: Anel }) {
  const aneisDeForaPraDentro: { id: Anel; r: number }[] = [
    { id: 4, r: 10 },
    { id: 3, r: 7.4 },
    { id: 2, r: 4.8 },
    { id: 1, r: 2.2 },
  ];
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" aria-hidden>
      {aneisDeForaPraDentro.map(({ id, r }) =>
        id === anel ? (
          <circle key={id} cx={12} cy={12} r={r} fill="var(--vr-ok-bg)" stroke="var(--vr-ok)" strokeWidth={1.3} />
        ) : (
          <circle key={id} cx={12} cy={12} r={r} fill="none" stroke="var(--vr-border-strong)" strokeWidth={1} />
        ),
      )}
    </svg>
  );
}

export function TelaRadar({ base, proximidade: proximidadeOriginal }: { base: Base; proximidade: BaseProximidade }) {
  const { estados } = useEstados();
  // a avaliação de relevância (1/2/3) muda o VSCS da conta; se a ação da matriz ICP × VSCS muda, muda o anel
  const proximidade = useMemo(() => {
    const vista = aplicarAvaliacoes(base, estados);
    if (vista === base) return proximidadeOriginal;
    const porId = new Map(vista.contas.map(c => [c.id, c]));
    const contas = proximidadeOriginal.contas.map(c => {
      const conta = porId.get(c.id);
      const timing = conta ? conta.score / 100 : c.dimensoes.timing;
      if (!conta || Math.abs(timing - c.dimensoes.timing) < 0.005) return c;
      const dimensoes = { ...c.dimensoes, timing };
      // mesma regra do score_v2.py: ação da matriz ICP × VSCS (ou via rápida de intenção) decide o anel
      const acao = conta.acaoRecomendada ?? '';
      const sinalRelevante = ACOES_DE_ABORDAGEM.has(acao) || !!conta.v2?.via_rapida;
      const anel: Anel = c.anel === 4 ? 4 : sinalRelevante ? (c.acesso.canalVerificado ? 1 : 2) : acao === 'Ampliar pesquisa' ? 2 : 3;
      const { pesos } = proximidadeOriginal;
      const prox = dimensoes.fit * pesos.fit + timing * pesos.timing + dimensoes.access * pesos.access + dimensoes.engagement * pesos.engagement;
      return { ...c, dimensoes, sinalRelevante, anel, proximity: prox };
    });
    return { ...proximidadeOriginal, contas };
  }, [base, estados, proximidadeOriginal]);
  const [bracos, setBracos] = useState<Braco[]>([]);
  const [ufs, setUfs] = useState<UF[]>([]);
  const [sinais, setSinais] = useState<string[]>([]);
  const [soCaminhoQuente, setSoCaminhoQuente] = useState(false);
  const [tiers, setTiers] = useState<string[]>([]);
  const [regioes, setRegioes] = useState<string[]>([]);
  const [statusScore, setStatusScore] = useState<string[]>([]);
  const [portes, setPortes] = useState<string[]>([]);
  const contaBase = useMemo(() => new Map(base.contas.map(c => [c.id, c])), [base.contas]);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [painelAberto, setPainelAberto] = useState(false);
  const [destacadas, setDestacadas] = useState<Set<string>>(new Set());
  const [bannerDelta, setBannerDelta] = useState<string | null>(null);
  const [diaReplay, setDiaReplay] = useState<number | null>(null);
  const [tocandoReplay, setTocandoReplay] = useState(false);

  const faixaEstavelPorAnel = useMemo(() => faixaProximityPorAnel(proximidade.contas), [proximidade.contas]);

  const filtradas = useMemo(
    () =>
      proximidade.contas.filter(
        c =>
          (!bracos.length || bracos.includes(c.braco)) &&
          (!ufs.length || ufs.includes(c.uf)) &&
          (!sinais.length || (c.ultimoSinal && sinais.includes(c.ultimoSinal.tipo))) &&
          (!soCaminhoQuente || c.acesso.caminhoQuente) &&
          (!tiers.length || tiers.includes(c.tier ?? '')) &&
          (!regioes.length || regioes.includes(regiaoDe(c.uf))) &&
          (!statusScore.length || statusScore.includes(contaBase.get(c.id)?.vscsStatus ?? '')) &&
          (!portes.length || (contaBase.get(c.id) && portes.includes(porteDe(contaBase.get(c.id)!)))),
      ),
    [proximidade.contas, bracos, ufs, sinais, soCaminhoQuente, tiers, regioes, statusScore, portes, contaBase],
  );

  const pontos = useMemo(
    () => (diaReplay == null ? filtradas.map(pontoAtual) : filtradas.map(c => pontoHistorico(c, diaReplay))),
    [filtradas, diaReplay],
  );
  const selecionada = selecionadaId ? proximidade.contas.find(c => c.id === selecionadaId) ?? null : null;

  const naZona = proximidade.contas.filter(c => c.anel === 1 && !c.convertida).length;
  const convertidas = proximidade.contas.filter(c => c.convertida).length;

  useEffect(() => {
    try {
      const bruto = localStorage.getItem(CHAVE_ULTIMA_VISITA);
      const anterior: UltimaVisita | null = bruto ? JSON.parse(bruto) : null;
      if (anterior) {
        const entraram = proximidade.contas.filter(c => anterior.aneis[c.id] !== undefined && anterior.aneis[c.id]! > 1 && c.anel === 1);
        if (entraram.length) {
          setDestacadas(new Set(entraram.map(c => c.id)));
          setBannerDelta(`${plural(entraram.length, 'conta entrou', 'contas entraram')} na zona de ativação desde ${dataCurtaBr(anterior.em)}.`);
        }
      }
      const atual: UltimaVisita = { em: new Date().toISOString().slice(0, 10), aneis: Object.fromEntries(proximidade.contas.map(c => [c.id, c.anel])) };
      localStorage.setItem(CHAVE_ULTIMA_VISITA, JSON.stringify(atual));
    } catch {
      // localStorage indisponível (modo privado etc.) — segue sem o delta, não é crítico
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Casca base={base}>
      <main className="w-full max-w-[1440px] px-4 pt-2 pb-28 md:px-8 md:pt-8 md:pb-16">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Radar de proximidade</h1>
            <p className="mt-1 text-sm text-text-3">
              Distância até a primeira conversa: {plural(proximidade.contas.length, 'conta', 'contas')} da base. O anel vem da ação da matriz ICP × score (VSCS); a fatia é a família de TI.
            </p>
          </div>
          <div className="vr-card flex items-center gap-4 px-4 py-2.5">
            <div>
              <p className="vr-data text-xl font-semibold text-ok">
                {naZona}
              </p>
              <p className="text-xs text-text-3">prontas para abordar</p>
            </div>
            {convertidas > 0 && (
              <div className="border-l border-border pl-4">
                <p className="vr-data text-xl font-semibold text-foreground">{convertidas}</p>
                <p className="text-xs text-text-3">convertidas</p>
              </div>
            )}
          </div>
        </div>

        {bannerDelta && (
          <div className="mb-4 flex items-center gap-2 rounded-control border border-acid/40 bg-acid-soft px-3 py-2 text-sm text-foreground">
            <Sparkles className="size-4 shrink-0 text-foreground" strokeWidth={1.5} />
            {bannerDelta}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <MenuFiltro
            rotulo="Família de TI"
            opcoes={BRACOS.map(b => ({ id: b.id, rotulo: b.rotulo, qtd: proximidade.contas.filter(c => c.braco === b.id).length })).filter(b => b.qtd)}
            valor={bracos}
            onMudar={setBracos}
          />
          <MenuFiltro
            rotulo="Tier"
            opcoes={['A', 'B', 'C'].map(x => ({ id: x, rotulo: `Tier ${x}`, qtd: proximidade.contas.filter(c => c.tier === x).length })).filter(o => o.qtd)}
            valor={tiers}
            onMudar={setTiers}
          />
          <MenuFiltro
            rotulo="Status do score"
            opcoes={[...FAIXAS_VSCS]
              .reverse()
              .map(([, st]) => ({ id: st, rotulo: st, qtd: proximidade.contas.filter(c => contaBase.get(c.id)?.vscsStatus === st).length }))
              .filter(o => o.qtd)}
            valor={statusScore}
            onMudar={setStatusScore}
          />
          <MenuFiltro
            rotulo="Região"
            opcoes={[...REGIOES, SEM_UF].map(r => ({ id: r, rotulo: r, qtd: proximidade.contas.filter(c => regiaoDe(c.uf) === r).length })).filter(o => o.qtd)}
            valor={regioes}
            onMudar={setRegioes}
          />
          <MenuFiltro
            rotulo="Estado"
            opcoes={[...new Set([...UFS, ...proximidade.contas.map(c => c.uf)])]
              .map(uf => ({ id: uf, rotulo: uf, qtd: proximidade.contas.filter(c => c.uf === uf).length }))
              .filter(u => u.qtd)}
            valor={ufs}
            onMudar={setUfs}
          />
          <MenuFiltro
            rotulo="Porte"
            opcoes={PORTES.map(x => ({ id: x, rotulo: x, qtd: proximidade.contas.filter(c => contaBase.get(c.id) && porteDe(contaBase.get(c.id)!) === x).length })).filter(o => o.qtd)}
            valor={portes}
            onMudar={setPortes}
          />
          <MenuFiltro
            rotulo="Sinal"
            opcoes={TIPOS_SINAL.map(t => ({ id: t.id, rotulo: t.rotulo, qtd: proximidade.contas.filter(c => c.ultimoSinal?.tipo === t.id).length })).filter(t => t.qtd)}
            valor={sinais}
            onMudar={setSinais}
          />
          <button
            onClick={() => setSoCaminhoQuente(v => !v)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-sm transition-colors duration-[var(--vr-dur-hover)] max-md:h-10',
              soCaminhoQuente ? 'border-border-strong bg-secondary font-medium text-foreground' : 'border-border bg-card text-text-2 hover:border-border-strong',
            )}
            aria-pressed={soCaminhoQuente}
          >
            <Flame className="size-3.5" strokeWidth={1.5} />
            Só caminho quente
          </button>
          <p className="ml-auto text-xs text-text-3">{plural(filtradas.length, 'conta', 'contas')}</p>
        </div>

        <div className="mb-4">
          <ControleReplay
            diaOffset={diaReplay}
            tocando={tocandoReplay}
            onMudarDia={setDiaReplay}
            onTocar={() => setTocandoReplay(true)}
            onParar={() => setTocandoReplay(false)}
          />
        </div>

        <MovimentosSemana
          base={base}
          onAbrir={id => {
            setSelecionadaId(id);
            setPainelAberto(true);
          }}
        />

        <div className="vr-card grid grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_auto] lg:p-6">
          <RadarSvg
            pontos={pontos}
            faixaEstavelPorAnel={faixaEstavelPorAnel}
            selecionadaId={selecionadaId ?? undefined}
            destacadas={diaReplay == null ? destacadas : undefined}
            onSelecionar={id => {
              setSelecionadaId(id);
              setPainelAberto(true);
            }}
          />

          <div className="flex flex-row flex-wrap gap-4 lg:w-52 lg:flex-col lg:border-l lg:border-border lg:pl-5">
            {ANEIS.map(a => (
              <div key={a.id} className="flex min-w-36 flex-1 items-start gap-2.5 lg:flex-none">
                <IconeAnel anel={a.id} />
                <div>
                  <p className="text-xs font-semibold text-foreground">{a.rotulo}</p>
                  <p className="mt-0.5 text-xs text-text-3">{a.descricao}</p>
                </div>
              </div>
            ))}
            <div className="min-w-36 flex-1 border-t border-border pt-3 lg:flex-none">
              <p className="mb-2 text-xs font-semibold text-foreground">Contorno do logo</p>
              <div className="flex items-center gap-2 text-xs text-text-2">
                <span className="inline-block size-3 shrink-0 rounded-full border-2" style={{ borderColor: 'var(--vr-warm)' }} />
                Gatilho ativo (quanto mais forte, mais quente)
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-text-2">
                <span className="inline-block size-3 shrink-0 rounded-full border" style={{ borderColor: 'var(--vr-border-strong)' }} />
                Sem gatilho ativo
              </div>
              <p className="mt-2 text-xs text-text-2">Tamanho: tier de ICP (A maior, C menor).</p>
              <p className="mt-3 text-[11px] text-text-3">Scroll ou pinça pra dar zoom. Arraste pra mover.</p>
            </div>
          </div>
        </div>
      </main>

      <PainelConta conta={selecionada} aberto={painelAberto} onFechar={() => setPainelAberto(false)} />
    </Casca>
  );
}

function dataCurtaBr(iso: string) {
  const [, m, d] = iso.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${Number(d)} ${meses[Number(m) - 1]}`;
}
