'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, ExternalLink, Mail, Search, SearchX, UserRound } from 'lucide-react';
import type { Area, Base, Papel, PapelAbm } from '@/lib/tipos';
import { hrefConta, normalizar } from '@/lib/contas';
import { cn, plural } from '@/lib/utils';
import { baixarCsv } from '@/lib/exportar-csv';
import { Casca } from '@/components/casca/casca';
import { LogoConta } from '@/components/hoje/logo-conta';
import { Aviso } from '@/components/hoje/estados';
import { Button } from '@/components/ui/button';
import { MenuFiltro } from '@/components/contas/menu-filtro';

const AREAS: { id: Area; rotulo: string }[] = [
  { id: 'executivo', rotulo: 'Executivo' },
  { id: 'marketing', rotulo: 'Marketing' },
  { id: 'comercial', rotulo: 'Comercial' },
  { id: 'produto', rotulo: 'Produto' },
  { id: 'financeiro', rotulo: 'Financeiro' },
  { id: 'ti', rotulo: 'TI' },
  { id: 'operacoes', rotulo: 'Operações' },
  { id: 'compras', rotulo: 'Compras' },
  { id: 'juridico', rotulo: 'Jurídico' },
  { id: 'rh', rotulo: 'RH' },
  { id: 'outro', rotulo: 'Outro' },
];

const PAPEIS: { id: PapelAbm; rotulo: string }[] = [
  { id: 'assina_cheque', rotulo: 'Assina o cheque' },
  { id: 'decisor', rotulo: 'Decisor' },
  { id: 'dono_da_dor', rotulo: 'Dono da dor' },
  { id: 'trava', rotulo: 'Trava' },
  { id: 'influenciador', rotulo: 'Influenciador' },
];
const ORDEM_RELEVANCIA = { alta: 0, media: 1, baixa: 2 } as const;

/** Uma cor por papel: verde aprova o orçamento, azul decide, âmbar sente a dor, vermelho pode travar. */
const COR_PAPEL: Record<PapelAbm, string> = {
  assina_cheque: 'bg-ok-bg text-ok',
  decisor: 'bg-cool-bg text-cool',
  dono_da_dor: 'bg-warm-bg text-warm',
  trava: 'bg-risk-bg text-risk',
  influenciador: 'bg-secondary text-text-2',
};
// classes por extenso: o Tailwind só gera o que aparece escrito no código
const COR_BARRA: Record<PapelAbm, string> = {
  assina_cheque: 'bg-ok',
  decisor: 'bg-cool',
  dono_da_dor: 'bg-warm',
  trava: 'bg-risk',
  influenciador: 'bg-text-3',
};
const NIVEL = { alta: { rotulo: 'Alta', barras: 3 }, media: { rotulo: 'Média', barras: 2 }, baixa: { rotulo: 'Baixa', barras: 1 } } as const;

function TagPapel({ papel }: { papel?: PapelAbm }) {
  if (!papel) return null;
  return (
    <span className={cn('inline-flex items-center rounded-chip px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', COR_PAPEL[papel])}>
      {PAPEIS.find(x => x.id === papel)?.rotulo}
    </span>
  );
}

/** Nível de influência no contexto do ICP: três barras (alta), duas (média), uma (baixa). */
function Nivel({ nivel, papel }: { nivel?: 'alta' | 'media' | 'baixa'; papel?: PapelAbm }) {
  if (!nivel) return <span className="text-text-3">—</span>;
  const { rotulo, barras } = NIVEL[nivel];
  const cor = papel ? COR_BARRA[papel] : 'bg-text-3';
  return (
    <span className="inline-flex items-center gap-2 text-xs text-text-2" title={`Influência ${rotulo.toLowerCase()}`}>
      <span aria-hidden className="flex items-end gap-0.5">
        {[1, 2, 3].map(b => (
          <span key={b} className={cn('w-1 rounded-full', b === 1 ? 'h-1.5' : b === 2 ? 'h-2.5' : 'h-3.5', b <= barras ? cor : 'bg-border-strong')} />
        ))}
      </span>
      {rotulo}
    </span>
  );
}

interface Linha {
  nome: string;
  cargo: string;
  area: Area;
  papel: Papel;
  papelAbm?: PapelAbm;
  relevancia?: 'alta' | 'media' | 'baixa';
  contaTier: string;
  email?: string;
  linkedin?: string;
  contaId: string;
  contaNome: string;
  contaDominio: string;
}

/** Lista plana de pessoas (comitê de todas as contas), para achar quem falar sem entrar conta por conta. */
export function TelaDecisores({ base }: { base: Base }) {
  const [texto, setTexto] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);
  const [papeis, setPapeis] = useState<PapelAbm[]>([]);
  const [niveis, setNiveis] = useState<('alta' | 'media' | 'baixa')[]>([]);

  const pessoas = useMemo<Linha[]>(
    () => base.contas.flatMap(c => c.comite.map(p => ({ ...p, contaId: c.id, contaNome: c.nome, contaDominio: c.dominio, contaTier: c.tier }))),
    [base.contas],
  );

  const linhas = useMemo(() => {
    const t = normalizar(texto.trim());
    return pessoas
      .filter(p => !areas.length || areas.includes(p.area))
      .filter(p => !papeis.length || (p.papelAbm && papeis.includes(p.papelAbm)))
      .filter(p => !niveis.length || (p.relevancia && niveis.includes(p.relevancia)))
      .filter(p => !t || normalizar(`${p.nome} ${p.cargo} ${p.contaNome}`).includes(t))
      // relevância alta primeiro (papel ABM × ICP da conta), depois tier da conta e nome
      .sort(
        (a, b) =>
          ORDEM_RELEVANCIA[a.relevancia ?? 'baixa'] - ORDEM_RELEVANCIA[b.relevancia ?? 'baixa'] ||
          (a.contaTier || 'Z').localeCompare(b.contaTier || 'Z') ||
          a.contaNome.localeCompare(b.contaNome),
      );
  }, [pessoas, areas, papeis, niveis, texto]);

  const contar = (pred: (p: Linha) => boolean) => pessoas.filter(pred).length;
  const semFiltro = !texto && !areas.length && !papeis.length && !niveis.length;

  return (
    <Casca base={base}>
      <main className="mx-auto w-full max-w-[1120px] px-4 pt-2 pb-28 md:px-6 md:pt-10 md:pb-16">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Decisores</h1>
            <p className="mt-1 text-sm text-text-3">
              {semFiltro ? `${plural(pessoas.length, 'pessoa', 'pessoas')} em ${plural(base.contas.length, 'conta', 'contas')}` : `${linhas.length} de ${pessoas.length} pessoas`}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-0 flex-1 basis-full items-center md:max-w-72 md:basis-auto">
            <Search className="pointer-events-none absolute left-2.5 size-4 text-text-3" strokeWidth={1.5} />
            <span className="sr-only">Buscar pessoa, cargo ou conta</span>
            <input
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Nome, cargo ou conta"
              className="h-8 w-full rounded-control border border-input bg-card pr-3 pl-8 text-sm outline-none placeholder:text-text-3 max-md:h-10"
            />
          </label>
          <MenuFiltro
            rotulo="Papel no comitê"
            opcoes={PAPEIS.map(x => ({ ...x, qtd: contar(p => p.papelAbm === x.id) })).filter(x => x.qtd)}
            valor={papeis}
            onMudar={setPapeis}
          />
          <MenuFiltro
            rotulo="Nível"
            opcoes={(['alta', 'media', 'baixa'] as const).map(n => ({ id: n, rotulo: NIVEL[n].rotulo, qtd: contar(p => p.relevancia === n) }))}
            valor={niveis}
            onMudar={setNiveis}
          />
          <MenuFiltro rotulo="Área" opcoes={AREAS.map(a => ({ ...a, qtd: contar(p => p.area === a.id) })).filter(a => a.qtd)} valor={areas} onMudar={setAreas} />
          <Button
            size="sm"
            variant="ghost"
            className="md:ml-auto"
            onClick={() =>
              baixarCsv(
                'decisores.csv',
                ['Nome', 'Cargo', 'Área', 'Papel no comitê', 'Relevância', 'Conta', 'Tier da conta', 'Domínio da conta', 'E-mail', 'LinkedIn'],
                linhas.map(p => [
                  p.nome,
                  p.cargo,
                  AREAS.find(a => a.id === p.area)?.rotulo ?? p.area,
                  PAPEIS.find(x => x.id === p.papelAbm)?.rotulo ?? p.papel,
                  p.relevancia ?? '',
                  p.contaNome,
                  p.contaTier,
                  p.contaDominio,
                  p.email ?? '',
                  p.linkedin ?? '',
                ]),
              )
            }
          >
            <Download /> Baixar CSV
          </Button>
        </div>

        {!linhas.length ? (
          <Aviso icone={<SearchX className="size-5" strokeWidth={1.5} />} titulo={pessoas.length ? 'Ninguém com esses filtros' : 'Nenhum decisor na base'}>
            {pessoas.length ? 'Tire algum filtro ou busque por outro nome.' : 'Importe a lista de pessoas para começar.'}
          </Aviso>
        ) : (
          <div className="vr-card overflow-hidden">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-3">
                  <th scope="col" className="w-auto px-3 py-2.5 pl-4 font-medium md:pl-5">Pessoa</th>
                  <th scope="col" className="hidden w-[200px] px-3 py-2.5 font-medium sm:table-cell">Conta</th>
                  <th scope="col" className="hidden w-[110px] px-3 py-2.5 font-medium lg:table-cell">Área</th>
                  <th scope="col" className="hidden w-[150px] px-3 py-2.5 font-medium md:table-cell">Papel no comitê</th>
                  <th scope="col" className="hidden w-[96px] px-3 py-2.5 font-medium md:table-cell">Nível</th>
                  <th scope="col" className="w-[84px] px-3 py-2.5 pr-4 text-right font-medium md:w-[96px] md:pr-5">Contato</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((p, i) => (
                  <tr key={`${p.contaId}-${p.nome}-${i}`} className="border-b border-border last:border-b-0 hover:bg-muted">
                    <td className="py-2 pr-3 pl-4 md:pl-5">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-secondary text-text-2">
                          <UserRound className="size-4" strokeWidth={1.5} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{p.nome}</p>
                          <p className="truncate text-xs text-text-3">
                            {p.cargo}
                            <span className="sm:hidden"> · {p.contaNome}</span>
                          </p>
                          {/* no celular as colunas somem: papel e nível vão para baixo do cargo */}
                          <div className="mt-1 flex items-center gap-2 md:hidden">
                            <TagPapel papel={p.papelAbm} />
                            <Nivel nivel={p.relevancia} papel={p.papelAbm} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden truncate px-3 py-2.5 sm:table-cell">
                      <Link href={hrefConta(p.contaId)} className="flex min-w-0 items-center gap-2 rounded-chip">
                        <LogoConta nome={p.contaNome} dominio={p.contaDominio} tamanho={20} />
                        <span className="truncate text-text-2 hover:text-foreground hover:underline">{p.contaNome}</span>
                      </Link>
                    </td>
                    <td className="hidden truncate px-3 py-2.5 text-text-2 lg:table-cell">{AREAS.find(a => a.id === p.area)?.rotulo ?? p.area}</td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <TagPapel papel={p.papelAbm} />
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <Nivel nivel={p.relevancia} papel={p.papelAbm} />
                    </td>
                    <td className="px-3 py-2.5 pr-4 md:pr-5">
                      <div className="flex items-center justify-end gap-1">
                        {p.email && (
                          <a href={`mailto:${p.email}`} aria-label={`E-mail de ${p.nome}`} className="grid size-7 place-items-center rounded-chip text-text-3 hover:text-foreground">
                            <Mail className="size-4" strokeWidth={1.5} />
                          </a>
                        )}
                        {p.linkedin && (
                          <a href={p.linkedin} target="_blank" rel="noreferrer" aria-label={`LinkedIn de ${p.nome}`} className="grid size-7 place-items-center rounded-chip text-text-3 hover:text-foreground">
                            <ExternalLink className="size-4" strokeWidth={1.5} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </Casca>
  );
}
