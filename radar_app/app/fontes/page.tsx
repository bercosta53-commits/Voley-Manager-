import { lerBase } from '@/lib/dados';
import { TelaFontes } from '@/components/fontes/fontes';

export const metadata = { title: 'Fontes' };

export default async function Pagina() {
  const base = await lerBase();
  return <TelaFontes base={base} />;
}
