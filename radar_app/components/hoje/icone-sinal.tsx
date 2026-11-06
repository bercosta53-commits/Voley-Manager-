import {
  Award,
  BriefcaseBusiness,
  Building2,
  CircleDollarSign,
  FileSignature,
  GitMerge,
  Globe,
  Handshake,
  Layers,
  Megaphone,
  Mic,
  Newspaper,
  PackagePlus,
  Sparkles,
  TrendingUp,
  UserRoundCog,
  UserRoundMinus,
  UserRoundPlus,
  UserRoundX,
  Radar,
} from 'lucide-react';

const ICONES: Record<string, typeof Radar> = {
  // exemplo (gerar_dados.py) — antes dos coletores reais rodarem
  troca_diretoria: UserRoundCog,
  novo_cmo: UserRoundPlus,
  fusao: GitMerge,
  vaga_marketing: BriefcaseBusiness,
  vaga_comercial: BriefcaseBusiness,
  socio_entrou: FileSignature,
  anuncios: Megaphone,
  lancamento: PackagePlus,
  // vagas (coletar_vagas.py)
  vaga_area_alvo: BriefcaseBusiness,
  vaga_lideranca_alvo: BriefcaseBusiness,
  vaga_expansao_comercial: BriefcaseBusiness,
  // notícias classificadas (classificar_sinais.py / coletar_noticias.py)
  executivo_chegou: UserRoundPlus,
  executivo_saiu: UserRoundX,
  fusao_aquisicao: GitMerge,
  captacao: CircleDollarSign,
  lancamento_ia: Sparkles,
  resultados_crescimento: TrendingUp,
  nova_unidade: Building2,
  expansao_mercado: Globe,
  lancamento_produto: PackagePlus,
  lancamento_servico: Layers,
  parceria: Handshake,
  premio: Award,
  palestra_evento: Mic,
  layoffs: UserRoundMinus,
  noticia_setorial: Newspaper,
};

export function IconeSinal({ tipo, className }: { tipo: string; className?: string }) {
  const Icone = ICONES[tipo] ?? Radar;
  return <Icone aria-hidden className={className} strokeWidth={1.5} />;
}
