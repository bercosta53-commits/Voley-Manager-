import { lerBase } from '@/lib/dados';
import { Hoje, type EstadoTela } from '@/components/hoje/hoje';

const ESTADOS: EstadoTela[] = ['carregando', 'vazio', 'erro', 'sem-permissao'];

// ?estado=carregando|vazio|erro|sem-permissao mostra cada estado obrigatório da tela, para revisão.
export default async function Pagina({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  const base = await lerBase();
  const estadoTela = ESTADOS.find(e => e === estado) ?? 'normal';
  return <Hoje base={base} estadoTela={estadoTela} />;
}
