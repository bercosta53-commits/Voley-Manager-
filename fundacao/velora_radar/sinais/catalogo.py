"""Catálogo de sinais: os 44 tipos do painel e mais quatro das fontes estruturadas (CNPJ e CVM),
com força, meia-vida e quem do comitê é afetado.

Força: F = forte, M = médio, N = negativo. A meia-vida é quantos dias o sinal leva para valer
metade; sinais de pessoa esfriam rápido, movimentos societários duram mais.
"""

from __future__ import annotations

from dataclasses import dataclass

PESO_FORCA = {"F": 3.0, "M": 1.5, "N": -3.0}
FATOR_CONFIANCA = {"alta": 1.0, "media": 0.75, "baixa": 0.5}
PAPEIS = ("decisor", "influenciador", "campeao", "financeiro", "tecnico", "usuario", "bloqueador", "indefinido")


@dataclass(frozen=True)
class TipoSinal:
    id: str
    rotulo: str
    forca: str
    meia_vida_dias: int
    papel: str
    cargo: str

    def peso(self, confianca: str = "alta") -> float:
        return round(PESO_FORCA[self.forca] * FATOR_CONFIANCA.get(confianca, 0.5), 2)


_T = TipoSinal
TIPOS = {
    t.id: t
    for t in [
        # Pessoas e liderança
        _T("novo_cmo", "Novo CMO, head de marketing ou growth", "F", 45, "decisor", "CMO / head de marketing"),
        _T("novo_diretor_comercial", "Novo diretor comercial ou CRO", "F", 45, "decisor", "Diretor comercial / CRO"),
        _T("novo_ceo", "Novo CEO ou presidente", "F", 60, "decisor", "CEO"),
        _T("novo_socio_diretor", "Novo sócio-diretor ou managing partner", "F", 60, "decisor", "Sócio-diretor"),
        _T("saida_lider_marketing", "Saída do líder de marketing sem substituto", "M", 30, "decisor", "CEO / diretor comercial"),
        _T("champion_mudou", "Contato da base mudou de empresa (champion)", "F", 60, "campeao", "Champion"),
        _T("promocao_marketing", "Promoção interna para liderança de marketing", "M", 45, "decisor", "Líder de marketing"),
        # Contratação
        _T("vaga_marketing", "Vaga de marketing, growth ou mídia paga", "F", 30, "influenciador", "Líder de marketing"),
        _T("vaga_sdr", "Vaga de SDR, BDR ou inside sales", "F", 30, "decisor", "Diretor comercial"),
        _T("vaga_revops", "Vaga de RevOps, CRM ou automação", "F", 30, "tecnico", "RevOps / diretor comercial"),
        _T("vaga_dados_marketing", "Vaga de dados ou BI de marketing", "M", 30, "tecnico", "Líder de marketing"),
        _T("vaga_executivo_regiao", "Vaga de executivo de contas em nova região", "M", 30, "decisor", "Diretor comercial"),
        _T("headcount_crescendo", "Headcount crescendo acima de 10% em 6 meses", "M", 60, "decisor", "CEO / diretor comercial"),
        _T("vaga_gestao_agencias", "Vaga para agency manager ou gestão de fornecedores", "F", 30, "influenciador", "Líder de marketing"),
        # Movimento corporativo
        _T("fusao_aquisicao", "Fusão ou aquisição", "F", 90, "decisor", "CEO / CMO"),
        _T("incorporacao_cooperativas", "Incorporação entre cooperativas", "F", 90, "decisor", "Superintendente"),
        _T("novos_socios", "Entrada de novos sócios", "F", 60, "decisor", "Sócio-diretor"),
        _T("rodada_investimento", "Rodada de investimento", "F", 90, "decisor", "CEO / CRO"),
        _T("nova_filial", "Abertura de filial ou nova unidade", "F", 60, "decisor", "Diretor comercial"),
        _T("novo_estado", "Entrada em novo estado", "F", 60, "decisor", "Diretor comercial"),
        _T("lancamento_produto", "Lançamento de produto ou nova linha", "M", 45, "influenciador", "CMO / head de produto"),
        _T("rebranding", "Rebranding ou mudança de nome", "M", 60, "decisor", "CMO"),
        _T("resultado_crescimento", "Resultado anual divulgado com crescimento", "M", 90, "financeiro", "Diretor financeiro"),
        _T("aumento_capital", "Aumento de capital social", "M", 90, "financeiro", "Diretor financeiro"),
        _T("fato_relevante", "Fato relevante ou comunicado ao mercado", "M", 45, "decisor", "Diretoria"),
        _T("emissao_titulos", "Emissão de debêntures ou outros títulos", "M", 60, "financeiro", "Diretor financeiro"),
        # Mercado e regulação
        _T("norma_nova", "Norma nova que muda a forma de vender", "F", 90, "decisor", "Diretor comercial"),
        _T("open_finance", "Movimento de Open Finance ou Open Insurance", "M", 60, "tecnico", "Diretor de negócios"),
        _T("ranking_setorial", "Entrada ou subida em ranking setorial", "M", 60, "decisor", "Sócio-diretor / CEO"),
        _T("concorrente_moveu", "Concorrente direto fez aquisição ou captou", "M", 45, "decisor", "CEO / diretor comercial"),
        _T("licitacao_vencida", "Licitação ou contrato relevante vencido", "M", 45, "decisor", "Diretor comercial"),
        # Pegada digital
        _T("comecou_anuncios", "Começou a anunciar no Google, Meta ou LinkedIn", "F", 30, "influenciador", "Líder de marketing"),
        _T("pausou_anuncios", "Pausou anúncios após período ativo", "M", 30, "influenciador", "Líder de marketing"),
        _T("site_novo", "Site novo ou redesenhado", "M", 45, "influenciador", "Líder de marketing"),
        _T("troca_crm", "Troca ou instalação de CRM ou automação", "F", 45, "tecnico", "RevOps"),
        _T("nova_landing", "Nova página de captura ou landing page", "M", 30, "influenciador", "Líder de marketing"),
        _T("mais_publicacoes", "Aumento de publicações no LinkedIn da empresa", "M", 30, "influenciador", "Líder de marketing"),
        _T("rfp_agencia", "Publicação de RFP ou busca de agência", "F", 30, "decisor", "Líder de marketing"),
        # Engajamento com a Velora
        _T("visita_site", "Visita a páginas de serviço ou cases", "F", 14, "campeao", "Quem visitou"),
        _T("download_white_paper", "Download de white paper por ICP", "F", 21, "campeao", "Quem baixou"),
        _T("interacao_posts", "Interação com posts dos sócios", "M", 14, "campeao", "Quem interagiu"),
        _T("aceite_conexao", "Aceite de convite de conexão", "M", 21, "campeao", "Quem aceitou"),
        _T("presenca_evento", "Presença em evento, palestra ou aula", "F", 30, "campeao", "Participante"),
        # Negativos
        _T("demissoes_congelamento", "Demissões em massa ou congelamento de vagas", "N", 90, "bloqueador", "Diretoria"),
        _T("recuperacao_judicial", "Recuperação judicial", "N", 365, "bloqueador", "Diretoria"),
        _T("contratou_concorrente", "Contratou consultoria ou agência concorrente", "N", 180, "bloqueador", "Líder de marketing"),
        _T("queda_headcount", "Queda de headcount acima de 10% em 6 meses", "N", 180, "bloqueador", "Diretoria"),
        _T("saida_socio", "Saída de sócio ou administrador", "M", 60, "decisor", "Sócio-diretor"),
    ]
}


def tipo(tipo_id: str) -> TipoSinal | None:
    return TIPOS.get(tipo_id)
