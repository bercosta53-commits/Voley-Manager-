import { lerBase } from '@/lib/dados';
import { TelaFontes } from '@/components/fontes/fontes';

export default async function Pagina() {
  const base = await lerBase();
  return <TelaFontes base={base} />;
}
