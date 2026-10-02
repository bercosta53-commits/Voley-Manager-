import { BriefcaseBusiness, Building2, FileSignature, GitMerge, Megaphone, PackagePlus, UserRoundCog, UserRoundPlus, Radar } from 'lucide-react';

const ICONES: Record<string, typeof Radar> = {
  troca_diretoria: UserRoundCog,
  novo_cmo: UserRoundPlus,
  fusao: GitMerge,
  vaga_marketing: BriefcaseBusiness,
  vaga_comercial: BriefcaseBusiness,
  socio_entrou: FileSignature,
  anuncios: Megaphone,
  nova_unidade: Building2,
  lancamento: PackagePlus,
};

export function IconeSinal({ tipo, className }: { tipo: string; className?: string }) {
  const Icone = ICONES[tipo] ?? Radar;
  return <Icone aria-hidden className={className} strokeWidth={1.5} />;
}
