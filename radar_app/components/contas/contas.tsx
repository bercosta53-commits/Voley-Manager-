'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, BookmarkPlus, Search, SearchX, X } from 'lucide-react';
import type { Base, Conta, Sinal } from '@/lib/tipos';
import { FAMILIAS, STATUS, familia, hrefConta, primeiraMaiuscula, rotuloStatus, status } from '@/lib/contas';
import { SEM_FILTRO, aplicar, daUrl, temFiltro, type Filtros } from '@/lib/filtros';
import { cn, plural, quando } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Casca } from '@/components/casca/casca';
import { LogoConta } from '@/components/hoje/logo-conta';
import { Curva } from '@/components/hoje/score';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { sentido } from '@/lib/contas';
import { Aviso, ErroCarregar, SemPermissao } from '@/components/hoje/estados';
import { useEstados } from '@/components/hoje/estado';
import { MenuFiltro } from './menu-filtro';

type Coluna = 'nome' | 'score' | 'tendencia' | 'sinal';
type EstadoTela = 'normal' | 'carregando' | 'vazio' | 'erro' | 'sem-permissao';
const ESTADOS: EstadoTela[] = ['carregando', 'vazio', 'erro', 'sem-permissao'];

interface Salvo {
  id: string;
  nome: string;
  filtros: Filtros;
  fixo?: boolean;
}

const FIXOS: Salvo[] = [
  { id: 'todas', nome: 'Todas', filtros: SEM_FILTRO, fixo: true },
  { id: 'ativar', nome: 'Prontas para ativar', filtros: { ...SEM_FILTRO, status: ['ativar'] }, fixo: true },
  { id: 'esquentando', nome: 'Esquentando', filtros: { ...SEM_FILTRO, tendencia: 'sobe' }, fixo: true },
  { id: 'com-sinal', nome: 'Com sinal na caixa', filtros: { ...SEM_FILTRO, comSinal: true }, fixo: true },
];
const CHAVE_SALVOS = 'vr:contas:filtros:v1';

export function TelaContas({ base }: { base: Base }) {
  const router = useRouter();
  const [estadoTela, setEstadoTela] = useState<EstadoTela>('normal');
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTRO);
  const [ordem, setOrdem] = useState<{ col: Coluna; desc: boolean }>({ col: 'score', desc: true });
  const [salvos, setSalvos] = useState<Salvo[]>([]);
  const [nomeNovo, setNomeNovo] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const { estados } = useEstados();
  const hoje = base.geradoEm;

  useEffect(() => {
    const e = new URLSearchParams(location.search).get('estado') as EstadoTela | null;
    if (e && ESTADOS.includes(e)) setEstadoTela(e);
    const f = daUrl(location.search);
    if (f) setFiltros(f);
    try {
      setSalvos(JSON.parse(localStorage.getItem(CHAVE_SALVOS) || '[]'));
    } catch {}
    setPronto(true);
  }, []);

  function guardar(prox: Salvo[]) {
    setSalvos(prox);
    try {
      localStorage.setItem(CHAVE_SALVOS, JSON.stringify(prox));
    } catch {}
  }

  const contas = estadoTela === 'vazio' ? [] : base.contas;
  const sinaisPorConta = useMemo(() => {
    const m = new Map<string, Sinal[]>();
    // Só os sinais ainda na caixa (sem ação, ou adiados que já venceram).
    for (const s of base.sinais) {
      const e = estados[s.id];
      if (!e?.acao || (e.acao === 'adiado' && !!e.ate && e.ate <= hoje)) m.set(s.contaId, [...(m.get(s.contaId) ?? []), s]);
    }
    return m;
  }, [base.sinais, estados, hoje]);

  const linhas = useMemo(() => {
    const ult = (c: Conta) => sinaisPorConta.get(c.id)?.[0]?.data ?? c.historico[0]?.data ?? '';
    const valor = (c: Conta): number | string =>
      ordem.col === 'nome' ? c.nome.toLowerCase() : ordem.col === 'score' ? c.score : ordem.col === 'tendencia' ? c.tendencia : ult(c);
    return aplicar(contas, filtros, sinaisPorConta).sort((a, b) => {
      const va = valor(a),
        vb = valor(b);
      const r = va < vb ? -1 : va > vb ? 1 : b.score - a.score;
      return ordem.desc ? -r : r;
    });
  }, [contas, filtros, ordem, sinaisPorConta]);

  const todosSalvos = [...FIXOS, ...salvos];
  const ativo = todosSalvos.find(s => JSON.stringify(s.filtros) === JSON.stringify(filtros));
  const mudar = (parte: Partial<Filtros>) => setFiltros(f => ({ ...f, ...parte }));
  const contar = (pred: (c: Conta) => boolean) => contas.filter(pred).length;

  function ordenar(col: Coluna) {
    setOrdem(o => (o.col === col ? { col, desc: !o.desc } : { col, desc: col !== 'nome' }));
  }

  const semDados = estadoTela === 'erro' || estadoTela === 'sem-permissao';
  const carregando = estadoTela === 'carregando' || !pronto;

  return (
    <Casca base={base}>
      <main className="mx-auto w-full max-w-[1120px] px-4 pt-2 pb-28 md:px-6 md:pt-10 md:pb-16">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Contas</h1>
            <p className="mt-1 text-sm text-text-3">
              {semDados || carregando ? 'Contas-alvo da Velora' : `${linhas.length === contas.length ? plural(contas.length, 'conta', 'contas') : `${linhas.length} de ${contas.length} contas`}, da mais quente para a mais fria`}
            </p>
          </div>
        </div>

        {semDados ? (
          estadoTela === 'erro' ? <ErroCarregar oque="as contas" onTentar={() => location.reload()} /> : <SemPermissao />
        ) : (
          <>
            {/* filtros salvos */}
            <div role="tablist" aria-label="Filtros salvos" className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
              {todosSalvos.map(s => (
                <div key={s.id} className="flex shrink-0 items-center">
                  <button
                    role="tab"
                    aria-selected={ativo?.id === s.id}
                    onClick={() => setFiltros(s.filtros)}
                    className={cn(
                      'h-8 rounded-control px-3 text-sm font-medium whitespace-nowrap text-text-3 transition-colors duration-[var(--vr-dur-hover)] hover:text-foreground max-md:h-10',
                      ativo?.id === s.id && 'bg-secondary text-foreground',
                    )}
                  >
                    {s.nome}
                  </button>
                  {!s.fixo && ativo?.id === s.id && (
                    <button
                      aria-label={`Apagar o filtro ${s.nome}`}
                      onClick={() => {
                        const antes = salvos;
                        guardar(salvos.filter(x => x.id !== s.id));
                        toast(`Filtro "${s.nome}" apagado`, { action: { label: 'Desfazer', onClick: () => guardar(antes) } });
                      }}
                      className="-ml-1 grid size-7 place-items-center rounded-control text-text-3 hover:text-foreground"
                    >
                      <X className="size-3.5" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* busca + filtros */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <label className="relative flex min-w-0 flex-1 basis-full items-center md:max-w-72 md:basis-auto">
                <Search className="pointer-events-none absolute left-2.5 size-4 text-text-3" strokeWidth={1.5} />
                <span className="sr-only">Buscar conta</span>
                <input
                  value={filtros.texto}
                  onChange={e => mudar({ texto: e.target.value })}
                  placeholder="Nome, CNPJ, domínio ou pessoa"
                  className="h-8 w-full rounded-control border border-input bg-card pr-3 pl-8 text-sm outline-none placeholder:text-text-3 max-md:h-10"
                />
              </label>
              <MenuFiltro
                rotulo="Segmento"
                opcoes={FAMILIAS.map(f => ({ ...f, qtd: contar(c => familia(c) === f.id) })).filter(f => f.qtd)}
                valor={filtros.familias}
                onMudar={v => mudar({ familias: v })}
              />
              <MenuFiltro
                rotulo="Tier"
                opcoes={[...new Set(contas.map(c => c.tier))].sort().map(t => ({ id: t, rotulo: `Tier ${t}`, qtd: contar(c => c.tier === t) }))}
                valor={filtros.tiers}
                onMudar={v => mudar({ tiers: v })}
              />
              <MenuFiltro
                rotulo="Status"
                opcoes={STATUS.map(s => ({ id: s.id, rotulo: s.rotulo, qtd: contar(c => status(c) === s.id) }))}
                valor={filtros.status}
                onMudar={v => mudar({ status: v })}
              />
              <MenuFiltro
                rotulo="Tendência"
                unico
                opcoes={[
                  { id: 'sobe' as const, rotulo: 'Esquentando', qtd: contar(c => c.tendencia >= 3) },
                  { id: 'desce' as const, rotulo: 'Esfriando', qtd: contar(c => c.tendencia <= -3) },
                  { id: 'estavel' as const, rotulo: 'Estável', qtd: contar(c => Math.abs(c.tendencia) < 3) },
                ]}
                valor={filtros.tendencia ? [filtros.tendencia] : []}
                onMudar={v => mudar({ tendencia: v[0] ?? '' })}
              />
              {filtros.ufs.length > 0 && <Pilula onTirar={() => mudar({ ufs: [] })}>Em {filtros.ufs.join(', ')}</Pilula>}
              {filtros.comSinal && <Pilula onTirar={() => mudar({ comSinal: false })}>Com sinal na caixa</Pilula>}
              {filtros.semContato && <Pilula onTirar={() => mudar({ semContato: false })}>Sem ninguém do comitê</Pilula>}
              {filtros.scoreMin > 0 && <Pilula onTirar={() => mudar({ scoreMin: 0 })}>Score {filtros.scoreMin}+</Pilula>}
              {temFiltro(filtros) && (
                <div className="flex items-center gap-1 md:ml-auto">
                  {!ativo &&
                    (nomeNovo === null ? (
                      <Button size="sm" variant="ghost" onClick={() => setNomeNovo('')}>
                        <BookmarkPlus /> Salvar filtro
                      </Button>
                    ) : (
                      <form
                        onSubmit={e => {
                          e.preventDefault();
                          const nome = nomeNovo.trim();
                          if (!nome) return;
                          guardar([...salvos, { id: `s${Date.now()}`, nome, filtros }]);
                          setNomeNovo(null);
                          toast(`Filtro "${nome}" salvo`);
                        }}
                        className="flex items-center gap-1"
                      >
                        <input
                          autoFocus
                          value={nomeNovo}
                          onChange={e => setNomeNovo(e.target.value)}
                          onKeyDown={e => e.key === 'Escape' && setNomeNovo(null)}
                          placeholder="Nome do filtro"
                          aria-label="Nome do filtro"
                          className="h-8 w-40 rounded-control border border-input bg-card px-2.5 text-sm outline-none max-md:h-10"
                        />
                        <Button size="sm" type="submit">
                          Salvar
                        </Button>
                      </form>
                    ))}
                  <Button size="sm" variant="ghost" onClick={() => setFiltros(SEM_FILTRO)}>
                    Limpar
                  </Button>
                </div>
              )}
            </div>

            {carregando ? (
              <TabelaEsqueleto />
            ) : !linhas.length ? (
              <Aviso icone={<SearchX className="size-5" strokeWidth={1.5} />} titulo={contas.length ? 'Nenhuma conta com esses filtros' : 'Nenhuma conta na base'}>
                {contas.length ? (
                  <>
                    Tire algum filtro ou busque por outro nome.
                    <div className="mt-3">
                      <Button size="sm" onClick={() => setFiltros(SEM_FILTRO)}>
                        Limpar filtros
                      </Button>
                    </div>
                  </>
                ) : (
                  'Importe a planilha de contas (npm run dados) para começar.'
                )}
              </Aviso>
            ) : (
              <div className="vr-card overflow-hidden">
                <table className="w-full table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-text-3">
                      <Cabecalho col="nome" ordem={ordem} onOrdenar={ordenar} className="pl-4 md:pl-5">
                        Conta
                      </Cabecalho>
                      <th scope="col" className="hidden w-[200px] px-3 py-2.5 font-medium lg:table-cell">Segmento</th>
                      <th scope="col" className="hidden w-[116px] px-3 py-2.5 font-medium md:table-cell">Status</th>
                      <Cabecalho col="sinal" ordem={ordem} onOrdenar={ordenar} className="hidden w-[250px] md:table-cell">
                        Último sinal
                      </Cabecalho>
                      <Cabecalho col="score" ordem={ordem} onOrdenar={ordenar} alinhar="direita" className="w-[112px] pr-4 md:w-[150px] md:pr-5">
                        Score
                      </Cabecalho>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map(c => {
                      const s = sinaisPorConta.get(c.id)?.[0];
                      const h = c.historico[0];
                      return (
                        <tr
                          key={c.id}
                          onClick={e => {
                            if ((e.target as HTMLElement).closest('a')) return;
                            router.push(hrefConta(c.id));
                          }}
                          className="cursor-pointer border-b border-border transition-colors duration-[var(--vr-dur-hover)] last:border-b-0 hover:bg-muted"
                        >
                          <td className="py-2 pr-3 pl-4 md:pl-5">
                            <div className="flex items-center gap-3">
                              <LogoConta nome={c.nome} dominio={c.dominio} tamanho={28} />
                              <div className="min-w-0">
                                <Link href={hrefConta(c.id)} className="block truncate rounded-chip font-semibold text-foreground">
                                  {c.nome}
                                </Link>
                                <span className="block truncate text-xs text-text-3">
                                  {[c.cidade && `${c.cidade}/${c.uf}`, `Tier ${c.tier}`].filter(Boolean).join(' · ')}
                                  <span className="md:hidden"> · {rotuloStatus(c)}</span>
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="hidden truncate px-3 py-2.5 text-text-2 lg:table-cell">{primeiraMaiuscula(c.segmento)}</td>
                          <td className="hidden px-3 py-2.5 md:table-cell">
                            <StatusChip conta={c} />
                          </td>
                          <td className="hidden px-3 py-2.5 md:table-cell">
                            {s ? (
                              <span className="flex items-center gap-1.5">
                                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-acid ring-1 ring-foreground/25" />
                                <span className="truncate text-text-2">{s.rotulo}</span>
                                <span className="vr-data shrink-0 text-xs text-text-3">{quando(s.data, base.geradoEm)}</span>
                                <span className="sr-only">(na caixa)</span>
                              </span>
                            ) : h ? (
                              <span className="flex items-center gap-1.5 text-text-3">
                                <span className="truncate">{h.rotulo}</span>
                                <span className="vr-data shrink-0 text-xs">{quando(h.data, base.geradoEm)}</span>
                              </span>
                            ) : (
                              <span className="text-text-3">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 pl-2 md:pr-5">
                            <ScoreLinha conta={c} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </Casca>
  );
}

function Cabecalho({
  col,
  ordem,
  onOrdenar,
  alinhar,
  className,
  children,
}: {
  col: Coluna;
  ordem: { col: Coluna; desc: boolean };
  onOrdenar: (c: Coluna) => void;
  alinhar?: 'direita';
  className?: string;
  children: React.ReactNode;
}) {
  const ativa = ordem.col === col;
  const Seta = ordem.desc ? ArrowDown : ArrowUp;
  return (
    <th scope="col" aria-sort={ativa ? (ordem.desc ? 'descending' : 'ascending') : 'none'} className={cn('px-3 py-1.5 font-medium', className)}>
      <button
        onClick={() => onOrdenar(col)}
        className={cn('inline-flex h-7 items-center gap-1 rounded-chip hover:text-foreground', ativa && 'text-foreground', alinhar === 'direita' && 'ml-auto flex')}
      >
        {children}
        <Seta className={cn('size-3.5', !ativa && 'opacity-0')} strokeWidth={1.5} />
      </button>
    </th>
  );
}

/** Score numa linha só (tabela densa): mini-curva, número e tendência com seta. */
function ScoreLinha({ conta }: { conta: Conta }) {
  const s = sentido(conta.tendencia);
  const cor = s === 'sobe' ? 'text-warm' : s === 'desce' ? 'text-cool' : 'text-text-3';
  const Seta = s === 'sobe' ? ArrowUpRight : s === 'desce' ? ArrowDownRight : Minus;
  return (
    <div className="flex items-center justify-end gap-2.5" role="img" aria-label={`Score ${conta.score}, ${s === 'sobe' ? 'esquentando' : s === 'desce' ? 'esfriando' : 'estável'}`}>
      <Curva serie={conta.serie} largura={44} altura={18} classe={cn(cor, 'max-md:hidden')} />
      <span className={cn('vr-data flex w-9 items-center justify-end gap-0.5 text-xs', cor)}>
        <Seta className="size-3" strokeWidth={1.5} />
        {s === 'estavel' ? '0' : Math.abs(conta.tendencia)}
      </span>
      <span className="w-8 text-right font-display text-md font-semibold tabular-nums">{conta.score}</span>
    </div>
  );
}

function StatusChip({ conta }: { conta: Conta }) {
  const s = status(conta);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-chip px-1.5 py-0.5 text-xs whitespace-nowrap',
        s === 'ativar' ? 'bg-ok-bg text-ok' : s === 'nutrir' ? 'bg-secondary text-text-2' : 'text-text-3',
      )}
    >
      {rotuloStatus(conta)}
    </span>
  );
}

function Pilula({ children, onTirar }: { children: React.ReactNode; onTirar: () => void }) {
  return (
    <span className="flex h-8 items-center gap-1 rounded-control border border-border-strong bg-secondary pr-1 pl-2.5 text-sm font-medium max-md:h-10">
      {children}
      <button onClick={onTirar} aria-label="Tirar filtro" className="grid size-6 place-items-center rounded-chip text-text-3 hover:text-foreground">
        <X className="size-3.5" strokeWidth={1.5} />
      </button>
    </span>
  );
}

function TabelaEsqueleto() {
  return (
    <div aria-busy aria-label="Carregando contas" className="vr-card divide-y divide-border">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}
