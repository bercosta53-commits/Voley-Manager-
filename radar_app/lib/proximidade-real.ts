import 'server-only';
import type { Base, Conta, Pessoa, Sinal } from './tipos';
import {
  BRACOS,
  PESOS_PADRAO,
  pecasFaltantes,
  type Anel,
  type BaseProximidade,
  type ContaProximidade,
  type PessoaComite,
  type PontoTrajetoria,
} from './proximidade';

/**
 * Radar de proximidade com a base real: anel, timing, fit e access vêm do VSCS 3.0 (scripts/score_v2.py,
 * gravado em conta.v2); a fatia é a família do ramo de TI (scripts/classificar_contas.py). Contas fora do
 * radar (opt-out, cliente ativo, convertida) não entram.
 */

const TIPO_RADAR: Record<string, string> = {
  executivo_chegou: 'troca_lideranca',
  executivo_saiu: 'troca_lideranca',
  vaga_area_alvo: 'vaga_aberta',
  vaga_lideranca_alvo: 'vaga_aberta',
  vaga_expansao_comercial: 'expansao',
  expansao_mercado: 'expansao',
  nova_unidade: 'expansao',
  captacao: 'expansao',
  fusao_aquisicao: 'expansao',
  lancamento_produto: 'lancamento',
  lancamento_servico: 'lancamento',
  lancamento_ia: 'lancamento',
};

const POTENCIAL_TIER: Record<string, number> = { A: 1, B: 0.65, C: 0.35 };

function papelIcp(p: Pessoa): PessoaComite['papelIcp'] {
  switch (p.papelAbm) {
    case 'assina_cheque':
      return 'pagador';
    case 'decisor':
    case 'dono_da_dor':
      return 'dono_problema';
    case 'trava':
      return 'guardiao';
    default:
      return 'influenciador';
  }
}

function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000);
}

export function gerarBaseProximidadeReal(base: Base): BaseProximidade {
  const hoje = base.geradoEm;
  const sinaisPorConta = new Map<string, Sinal[]>();
  for (const s of base.sinais) sinaisPorConta.set(s.contaId, [...(sinaisPorConta.get(s.contaId) ?? []), s]);

  const contas: ContaProximidade[] = [];
  for (const c of base.contas) {
    const v2 = c.v2 as (Conta['v2'] & { fit?: number; access?: number; engagement?: number; sinal_ativo?: boolean }) | undefined;
    if (!v2 || v2.anel == null) continue;
    const anel = v2.anel as Anel;
    const familia = c.ramoTI?.codigo && c.ramoTI.codigo !== 'A classificar' ? c.ramoTI.codigo.slice(0, 2) : 'XX';
    const braco = BRACOS.some(b => b.id === familia) ? familia : 'XX';
    const fit = v2.fit ?? 0.6;
    const access = v2.access ?? 0;
    const engagement = v2.engagement ?? 0;
    const dimensoes = { fit, timing: v2.timing, access, engagement };

    const comite = c.comite.map(p => ({
      nome: p.nome,
      cargo: p.cargo,
      papelIcp: papelIcp(p),
      mapeado: true,
      canalVerificado: !!(p.email || p.linkedin),
    }));
    const chave = comite.filter(p => p.papelIcp === 'pagador' || p.papelIcp === 'dono_problema');
    const acesso = { pessoaMapeada: chave.length > 0, canalVerificado: chave.some(p => p.canalVerificado), caminhoQuente: false };

    const sinais = (sinaisPorConta.get(c.id) ?? []).filter(s => s.tipo !== 'noticia_setorial').sort((a, b) => b.data.localeCompare(a.data));
    const ultimo = sinais[0];
    const diasUltimo = ultimo ? Math.max(0, diasEntre(ultimo.data, hoje)) : null;

    // trajetória: a série do score (90 dias, um ponto a cada 3) vira timing; o anel histórico segue a mesma regra
    const trajetoria: PontoTrajetoria[] = (c.serie.length ? c.serie : [c.score]).map((valor, i, arr) => {
      const t = valor / 100;
      const prox = PESOS_PADRAO.fit * fit + PESOS_PADRAO.timing * t + PESOS_PADRAO.access * access + PESOS_PADRAO.engagement * engagement;
      const anelDia: Anel = fit < 0.6 ? 4 : t >= 0.5 && acesso.canalVerificado ? 1 : t >= 0.5 ? 2 : 3;
      return { diaOffset: Math.round((i * 90) / Math.max(1, arr.length - 1)), proximity: prox, anel: anelDia };
    });

    contas.push({
      id: c.id,
      nome: c.nome,
      dominio: c.dominio,
      tier: c.tier,
      frase: v2.frase,
      braco,
      subsegmento: braco === 'XX' ? 'A classificar' : c.ramoTI!.nome,
      uf: c.uf || '—',
      potencial: POTENCIAL_TIER[c.tier] ?? 0.5,
      dimensoes,
      proximity: v2.proximity,
      anel,
      sinalRelevante: !!v2.sinal_ativo,
      acesso,
      pecasFaltantes: pecasFaltantes(!!v2.sinal_ativo, acesso, diasUltimo),
      ultimoSinal: ultimo ? { tipo: TIPO_RADAR[ultimo.tipo] ?? 'mencao', rotulo: ultimo.sinal ?? ultimo.rotulo, diasAtras: diasUltimo ?? 0 } : null,
      caminhoQuenteVia: null,
      comite,
      convertida: false,
      trajetoria,
    });
  }

  return { geradoEm: hoje, metaZonaAtivacao: 30, pesos: PESOS_PADRAO, versaoPesos: '2.1', contas };
}
