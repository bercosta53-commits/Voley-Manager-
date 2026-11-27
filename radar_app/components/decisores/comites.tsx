'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { UserRound, UserRoundSearch } from 'lucide-react';
import type { Conta, Pessoa } from '@/lib/tipos';
import { hrefConta, normalizar } from '@/lib/contas';
import { LUGARES_ESSENCIAIS, COR_BARRA, ocupa, papelNoComite } from '@/lib/papeis';
import { cn, plural } from '@/lib/utils';
import { LogoConta } from '@/components/hoje/logo-conta';
import { MenuFiltro } from '@/components/contas/menu-filtro';
import type { PapelAbm } from '@/lib/tipos';

const POR_PAGINA = 24;
type Recorte = 'todas' | 'incompleto' | 'completo';

const lugaresPreenchidos = (c: Conta) => LUGARES_ESSENCIAIS.filter(l => c.comite.some(p => ocupa(p, l.papel))).length;
const SEM = 'Sem classificação';
const familiaDe = (c: Conta) => c.ramoTI?.familia || SEM;
const verticalDe = (c: Conta) => c.especializacao?.nome || SEM;
const ufDe = (c: Conta) => c.uf || 'Sem UF';
const tierDe = (c: Conta) => (c.tier ? `Tier ${c.tier}` : 'Sem Tier');
/** opções de um filtro com a contagem, mais frequentes primeiro e "sem" por último */
function opcoes(contas: Conta[], chave: (c: Conta) => string, ordemFixa = false) {
  const m = new Map<string, number>();
  for (const c of contas) m.set(chave(c), (m.get(chave(c)) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => Number(a[0].startsWith('Sem')) - Number(b[0].startsWith('Sem')) || (ordemFixa ? a[0].localeCompare(b[0]) : b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')))
    .map(([id, qtd]) => ({ id, rotulo: id, qtd }));
}

/** Um lugar do comitê: quem ocupa (o primeiro e quantos mais) ou o lugar vazio, a mapear. */
function Lugar({ rotulo, cor, pessoas }: { rotulo: string; cor: string; pessoas: Pessoa[] }) {
  const [p, ...resto] = pessoas;
  return (
    <li className="grid grid-cols-[104px_minmax(0,1fr)] items-start gap-2 py-1.5">
      <span className="flex items-center gap-1.5 pt-0.5 text-xs text-text-3">
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full', cor)} />
        {rotulo}
      </span>
      {p ? (
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-sm font-medium">
            <UserRound aria-hidden className="size-3.5 shrink-0 text-text-3" strokeWidth={1.5} />
            <span className="truncate">{p.nome}</span>
            {resto.length > 0 && <span className="vr-data shrink-0 text-xs font-normal text-text-3">+{resto.length}</span>}
          </span>
          <span className="block truncate text-xs text-text-3">{p.cargo}</span>
        </span>
      ) : (
        <span className="flex items-center gap-1 rounded-control border border-dashed border-border-strong px-2 py-1 text-xs text-text-3">
          <UserRoundSearch aria-hidden className="size-3.5 shrink-0" strokeWidth={1.5} />a mapear
        </span>
      )}
    </li>
  );
}

/**
 * Decisores por conta: cada conta com os três lugares que fazem o comitê completo (assina o cheque, decisor, dono
 * da dor), preenchidos ou vazios, e quantas outras pessoas (influenciadores, trava). Tier A primeiro; dentro do
 * tier, os comitês mais perto de completos.
 */
export function ComitesPorConta({ contas, busca }: { contas: Conta[]; busca: string }) {
  const [recorte, setRecorte] = useState<Recorte>('todas');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [familias, setFamilias] = useState<string[]>([]);
  const [verticais, setVerticais] = useState<string[]>([]);
  const [ufs, setUfs] = useState<string[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [faltando, setFaltando] = useState<PapelAbm[]>([]);
  useEffect(() => setLimite(POR_PAGINA), [recorte, busca, familias, verticais, ufs, tiers, faltando]);
  const nFiltros = familias.length + verticais.length + ufs.length + tiers.length + faltando.length;

  const todasComPessoas = useMemo(() => contas.filter(c => c.comite.length), [contas]);
  // filtros de atributo (família, vertical, UF, tier, lugar que falta) valem para a contagem dos recortes também
  const comPessoas = useMemo(
    () =>
      todasComPessoas.filter(
        c =>
          (!familias.length || familias.includes(familiaDe(c))) &&
          (!verticais.length || verticais.includes(verticalDe(c))) &&
          (!ufs.length || ufs.includes(ufDe(c))) &&
          (!tiers.length || tiers.includes(tierDe(c))) &&
          (!faltando.length || faltando.some(papel => !c.comite.some(p => ocupa(p, papel)))),
      ),
    [todasComPessoas, familias, verticais, ufs, tiers, faltando],
  );
  const contagem = useMemo(
    () => ({
      todas: comPessoas.length,
      incompleto: comPessoas.filter(c => lugaresPreenchidos(c) < 3).length,
      completo: comPessoas.filter(c => lugaresPreenchidos(c) === 3).length,
    }),
    [comPessoas],
  );
  const lista = useMemo(() => {
    const t = normalizar(busca.trim());
    return comPessoas
      .filter(c => recorte === 'todas' || (recorte === 'completo' ? lugaresPreenchidos(c) === 3 : lugaresPreenchidos(c) < 3))
      .filter(c => !t || normalizar(`${c.nome} ${c.comite.map(p => `${p.nome} ${p.cargo}`).join(' ')}`).includes(t))
      .sort((a, b) => (a.tier || 'Z').localeCompare(b.tier || 'Z') || lugaresPreenchidos(b) - lugaresPreenchidos(a) || a.nome.localeCompare(b.nome));
  }, [comPessoas, recorte, busca]);

  return (
    <section aria-label="Comitê de compra por conta">
      <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Filtros dos comitês">
        <MenuFiltro rotulo="Família de TI" opcoes={opcoes(todasComPessoas, familiaDe)} valor={familias} onMudar={setFamilias} />
        <MenuFiltro rotulo="Vertical do cliente" opcoes={opcoes(todasComPessoas, verticalDe)} valor={verticais} onMudar={setVerticais} />
        <MenuFiltro rotulo="Estado" opcoes={opcoes(todasComPessoas, ufDe, true)} valor={ufs} onMudar={setUfs} />
        <MenuFiltro rotulo="Tier" opcoes={opcoes(todasComPessoas, tierDe, true)} valor={tiers} onMudar={setTiers} />
        <MenuFiltro
          rotulo="Lugar que falta"
          opcoes={LUGARES_ESSENCIAIS.map(l => ({ id: l.papel, rotulo: `Sem ${l.rotulo.toLowerCase()}`, qtd: todasComPessoas.filter(c => !c.comite.some(p => ocupa(p, l.papel))).length })).filter(o => o.qtd)}
          valor={faltando}
          onMudar={setFaltando}
        />
        {nFiltros > 0 && (
          <button
            type="button"
            onClick={() => (setFamilias([]), setVerticais([]), setUfs([]), setTiers([]), setFaltando([]))}
            className="px-2 text-sm font-medium text-text-3 underline-offset-4 hover:text-foreground hover:underline"
          >
            Limpar filtros ({nFiltros})
          </button>
        )}
      </div>
      <div role="radiogroup" aria-label="Recorte dos comitês" className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ['todas', 'Todas as contas'],
            ['incompleto', 'Comitê incompleto'],
            ['completo', 'Comitê completo'],
          ] as [Recorte, string][]
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={recorte === id}
            onClick={() => setRecorte(id)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-chip border px-2.5 text-sm max-md:h-10',
              recorte === id ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-text-2 hover:text-foreground',
            )}
          >
            {rotulo} <span className="vr-data text-xs opacity-80">{contagem[id]}</span>
          </button>
        ))}
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lista.slice(0, limite).map(c => {
          const n = lugaresPreenchidos(c);
          const outros = c.comite.filter(p => !LUGARES_ESSENCIAIS.some(l => ocupa(p, l.papel)));
          const travas = outros.filter(p => papelNoComite(p) === 'trava').length;
          return (
            <li key={c.id} className="vr-card flex flex-col p-4">
              <div className="flex items-start gap-3">
                <LogoConta nome={c.nome} dominio={c.dominio} tamanho={32} />
                <div className="min-w-0 flex-1">
                  <Link href={hrefConta(c.id)} className="block truncate font-semibold hover:underline">
                    {c.nome}
                  </Link>
                  <span className="block truncate text-xs text-text-3">{[c.tier && `Tier ${c.tier}`, c.ramoTI?.nome].filter(Boolean).join(' · ')}</span>
                </div>
                {/* três marcas: lugares preenchidos de 3 */}
                <span className="flex shrink-0 flex-col items-end gap-1" aria-label={`${n} de 3 lugares do comitê preenchidos`}>
                  <span aria-hidden className="flex gap-0.5">
                    {[0, 1, 2].map(i => (
                      <span key={i} className={cn('h-2.5 w-3 rounded-[2px]', i < n ? 'bg-ok' : 'bg-secondary')} />
                    ))}
                  </span>
                  <span className={cn('vr-data text-xs', n === 3 ? 'text-ok' : 'text-text-3')}>{n === 3 ? 'completo' : `${n} de 3`}</span>
                </span>
              </div>
              <ul className="mt-3 divide-y divide-border border-t border-border">
                {LUGARES_ESSENCIAIS.map(l => (
                  <Lugar key={l.papel} rotulo={l.rotulo} cor={COR_BARRA[l.papel]} pessoas={c.comite.filter(p => ocupa(p, l.papel))} />
                ))}
              </ul>
              {outros.length > 0 && (
                <p className="mt-auto border-t border-border pt-2 text-xs text-text-3">
                  + {plural(outros.length - travas, 'influenciador', 'influenciadores')}
                  {travas > 0 && ` · ${plural(travas, 'pode travar', 'podem travar')}`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {lista.length > limite && (
        <button type="button" onClick={() => setLimite(l => l + POR_PAGINA)} className="mt-3 w-full rounded-control border border-border bg-card px-4 py-3 text-sm font-medium text-text-2 hover:bg-muted">
          Mostrar mais {Math.min(POR_PAGINA, lista.length - limite)} · {limite} de {lista.length}
        </button>
      )}
      {!lista.length && <p className="vr-card p-6 text-center text-sm text-text-3">Nenhuma conta neste recorte.</p>}
    </section>
  );
}
