import { lerBase } from '@/lib/dados';
import { Hoje } from '@/components/hoje/hoje';

// Os estados da tela (?estado=carregando|vazio|erro|sem-permissao) são lidos no navegador, para a página também
// funcionar como arquivo estático (publicação).
export default async function Pagina() {
  const base = await lerBase();
  return <Hoje base={base} />;
}
