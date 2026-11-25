import { lerBase } from '@/lib/dados';
import { Hoje } from '@/components/hoje/hoje';

// a página do mesmo nível do layout não recebe o modelo de título: o título vai completo
export const metadata = { title: { absolute: 'Hoje | Velora Radar' } };

// Os estados da tela (?estado=carregando|vazio|erro|sem-permissao) são lidos no navegador, para a página também
// funcionar como arquivo estático (publicação).
export default async function Pagina() {
  const base = await lerBase();
  return <Hoje base={base} />;
}
